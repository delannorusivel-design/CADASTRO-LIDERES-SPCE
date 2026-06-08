import { useState, useRef, useCallback } from "react";

const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbyL6tetVYgkVppH2oRf_qt8yENZY159B2RBDqfA-yRdymRAjaZD08BpIgwnwVTa2ukE5A/exec";
const ADMIN_PIN = "7070";

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Falha ao ler arquivo"));
    r.readAsDataURL(file);
  });
}
function getMediaType(file) {
  if (file.type) return file.type;
  if (file.name.endsWith(".pdf")) return "application/pdf";
  return "image/jpeg";
}
const isImage = (f) => f.type.startsWith("image/");
const isPDF = (f) => f.type === "application/pdf" || f.name.endsWith(".pdf");
const isCSV = (f) => f.type === "text/csv" || f.name.endsWith(".csv");

async function parseCSV(file) {
  const text = await file.text();
  const lines = text.trim().split("\n").map(l => l.split(/[,;]/));
  if (lines.length < 2) return [];
  const headers = lines[0].map(h => h.trim().toLowerCase());
  return lines.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (row[i] || "").trim(); });
    return {
      nome: obj.nome || obj.name || obj["nome completo"] || "",
      cpf: obj.cpf || "",
      telefone: obj.telefone || obj.tel || obj.phone || "",
      titulo: obj.titulo || obj["título"] || obj["titulo de eleitor"] || obj["título de eleitor"] || "",
      zona: obj.zona || obj["zona eleitoral"] || "",
      secao: obj.secao || obj["seção"] || obj["seção eleitoral"] || "",
      fotoUrl: "",
    };
  }).filter(r => r.nome);
}

async function extractFromDocument(file) {
  const base64 = await fileToBase64(file);
  const mediaType = getMediaType(file);
  const systemPrompt = `Você é um assistente especializado em extrair dados de documentos eleitorais e pessoais brasileiros.
Retorne APENAS um objeto JSON válido com exatamente estas chaves:
{"nome":"","cpf":"","telefone":"","titulo":"","zona":"","secao":"","observacoes":""}
Se um campo não for encontrado, use string vazia. Não inclua markdown nem texto fora do JSON.`;
  const contentBlocks = [];
  if (isImage(file)) contentBlocks.push({ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } });
  else if (isPDF(file)) contentBlocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } });
  contentBlocks.push({ type: "text", text: "Extraia os dados desta pessoa do documento acima e retorne o JSON." });
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: contentBlocks }],
    }),
  });
  if (!response.ok) throw new Error(`API error ${response.status}`);
  const data = await response.json();
  const text = data.content.map(b => b.text || "").join("").trim();
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

async function sendToSheets(record) {
  await fetch(WEBHOOK_URL, {
    method: "POST", mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      acao: "cadastrarEleitor",
      nome: record.nome, cpf: record.cpf, telefone: record.telefone,
      titulo: record.titulo, zona: record.zona, secao: record.secao,
      fotoUrl: record.fotoUrl || "", observacoes: record.observacoes || "",
      timestamp: new Date().toISOString(),
    }),
  });
  return true;
}

function exportCSV(records) {
  const headers = ["Nome","CPF","Telefone","Título Eleitor","Zona","Seção","Foto URL","Observações","Status"];
  const rows = records.map(r =>
    [r.nome,r.cpf,r.telefone,r.titulo,r.zona,r.secao,r.fotoUrl,r.observacoes,r.status]
    .map(v => `"${(v||"").replace(/"/g,'""')}"`).join(",")
  );
  const blob = new Blob(["\ufeff"+[headers.join(","),...rows].join("\n")], { type:"text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cadastro_campanha_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

const emptyRecord = () => ({
  id: Date.now() + Math.random(),
  nome:"", cpf:"", telefone:"", titulo:"", zona:"", secao:"",
  fotoUrl:"", observacoes:"", status:"pendente", fotoFile: null,
});

// Design tokens — warm cream & terracotta
const C = {
  bg:       "#fdf6ef",
  surface:  "#fffaf5",
  border:   "#eed9c4",
  border2:  "#e0c4a8",
  orange:   "#e07840",
  orangeHov:"#c9622e",
  orangeL:  "#f5a870",
  orangeXL: "#fdeedd",
  text:     "#3d2410",
  textMid:  "#7a5030",
  textSoft: "#b89070",
  green:    "#4a7c50",
  greenL:   "#e8f3e8",
  red:      "#b03030",
  redL:     "#fdeaea",
  amber:    "#a06020",
  amberL:   "#fef4e0",
};

const S = {
  app: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "'Plus Jakarta Sans', 'Segoe UI', sans-serif",
  },
  header: {
    background: "#fff",
    borderBottom: `1px solid ${C.border}`,
    padding: "16px 36px",
    display: "flex", alignItems: "center", gap: "14px",
    position: "sticky", top: 0, zIndex: 100,
    boxShadow: "0 2px 16px rgba(160,80,20,0.08)",
  },
  logo: {
    width: 44, height: 44,
    background: `linear-gradient(145deg, ${C.orangeL}, ${C.orange})`,
    borderRadius: "12px",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "17px", fontWeight: 900, color: "#fff",
    boxShadow: "0 4px 14px rgba(224,120,64,0.4)",
    letterSpacing: "-0.02em",
  },
  headerTitle: { fontSize: "15px", fontWeight: 700, color: C.text },
  headerSub: { fontSize: "12px", color: C.textSoft, marginTop: "2px" },
  tabBar: {
    background: "#fff",
    borderBottom: `1px solid ${C.border}`,
    padding: "0 36px",
    display: "flex", gap: "2px",
  },
  tab: (active) => ({
    padding: "13px 18px", fontSize: "13px", fontWeight: 600,
    cursor: "pointer", border: "none", background: "transparent",
    color: active ? C.orange : C.textMid,
    borderBottom: active ? `2.5px solid ${C.orange}` : "2.5px solid transparent",
    transition: "all 0.16s",
  }),
  main: { maxWidth: "860px", margin: "0 auto", padding: "32px 24px" },
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: "18px", padding: "26px",
    marginBottom: "16px",
    boxShadow: "0 2px 20px rgba(160,80,20,0.06)",
  },
  sectionTitle: {
    fontSize: "11px", fontWeight: 800, letterSpacing: "0.1em",
    color: C.textMid, textTransform: "uppercase",
    marginBottom: "20px", paddingBottom: "12px",
    borderBottom: `1px solid ${C.border}`,
  },
  label: {
    display: "block", fontSize: "11px", fontWeight: 700,
    color: C.textMid, marginBottom: "5px", letterSpacing: "0.02em",
  },
  input: {
    width: "100%", padding: "9px 13px",
    background: "#fff", border: `1.5px solid ${C.border}`,
    borderRadius: "9px", color: C.text,
    fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "13px",
    outline: "none", boxSizing: "border-box",
    transition: "border-color 0.16s, box-shadow 0.16s",
  },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" },
  dropzone: (drag) => ({
    border: `2px dashed ${drag ? C.orange : C.border2}`,
    borderRadius: "14px", padding: "44px 24px",
    textAlign: "center", cursor: "pointer",
    background: drag ? C.orangeXL : `linear-gradient(160deg, #fffaf5 0%, #fdf0e0 100%)`,
    transition: "all 0.2s",
  }),
  btn: (v = "primary") => ({
    padding: "10px 22px", borderRadius: "9px", fontWeight: 700,
    fontSize: "13px", cursor: "pointer", border: "none",
    transition: "all 0.16s", display: "inline-flex", alignItems: "center", gap: "6px",
    ...(v === "primary" ? {
      background: `linear-gradient(135deg, ${C.orange}, ${C.orangeHov})`,
      color: "#fff", boxShadow: "0 4px 16px rgba(224,120,64,0.35)",
    } : v === "danger" ? {
      background: C.redL, border: `1.5px solid #f0c0c0`, color: C.red,
    } : {
      background: "#fff", border: `1.5px solid ${C.border2}`, color: C.textMid,
    }),
  }),
  badge: (status) => ({
    display: "inline-flex", alignItems: "center", gap: "4px",
    padding: "4px 10px", borderRadius: "999px",
    fontSize: "11px", fontWeight: 700,
    ...(status === "ok"   ? { background: C.greenL, color: C.green }
      : status === "erro" ? { background: C.redL,   color: C.red   }
      :                     { background: C.amberL, color: C.amber }),
  }),
  toast: (type) => ({
    position: "fixed", bottom: "24px", right: "24px",
    padding: "14px 20px", borderRadius: "12px", fontSize: "13px",
    fontWeight: 600, zIndex: 9999, maxWidth: "320px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
    ...(type === "ok"  ? { background: C.greenL, color: C.green, border: `1px solid #b0d4b0` }
      : type === "err" ? { background: C.redL,   color: C.red,   border: `1px solid #f0c0c0` }
      :                  { background: C.amberL, color: C.amber, border: `1px solid #e0c070` }),
  }),
};

function UploadView({ onRecordsExtracted }) {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(null);
  const inputRef = useRef();

  const handleFiles = useCallback((incoming) => {
    setFiles(prev => [...prev, ...Array.from(incoming)]);
  }, []);

  const onDrop = (e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); };

  const processFiles = async () => {
    if (!files.length) return;
    setProcessing(true);
    const records = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      setProgress(`Analisando ${i + 1} de ${files.length}: ${f.name}`);
      try {
        if (isCSV(f)) {
          const rows = await parseCSV(f);
          rows.forEach(r => records.push({ ...emptyRecord(), ...r }));
        } else {
          const extracted = await extractFromDocument(f);
          const rec = { ...emptyRecord(), ...extracted };
          if (isImage(f)) rec.fotoFile = f;
          records.push(rec);
        }
      } catch (err) {
        records.push({ ...emptyRecord(), nome: f.name, observacoes: `Erro: ${err.message}`, status: "erro" });
      }
    }
    setProgress(null); setProcessing(false); setFiles([]);
    onRecordsExtracted(records);
  };

  return (
    <div>
      <div style={S.sectionTitle}>Enviar documentos</div>
      <div style={S.card}>
        <p style={{ fontSize: "13px", color: C.textMid, marginBottom: "20px", lineHeight: 1.65 }}>
          Envie fotos de documentos (RG, CPF, título eleitoral, comprovante de residência), PDFs ou arquivos CSV com múltiplos cadastros. A IA extrai e organiza os dados automaticamente.
        </p>

        <div
          style={S.dropzone(drag)}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current.click()}
        >
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>📂</div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: C.orange, marginBottom: "6px" }}>
            Arraste arquivos aqui ou clique para selecionar
          </div>
          <div style={{ fontSize: "12px", color: C.textSoft }}>
            Aceita JPG · PNG · PDF · CSV
          </div>
          <input ref={inputRef} type="file" multiple accept="image/*,.pdf,.csv"
            style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
        </div>

        {files.length > 0 && (
          <div style={{ marginTop: "16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 800, color: C.textMid, marginBottom: "8px", letterSpacing: "0.08em" }}>
              {files.length} ARQUIVO(S) SELECIONADO(S)
            </div>
            {files.map((f, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 13px", background: C.orangeXL, borderRadius: "8px",
                marginBottom: "6px", fontSize: "12px", border: `1px solid ${C.border}`,
              }}>
                <span style={{ fontWeight: 600 }}>
                  {isImage(f) ? "🖼️" : isPDF(f) ? "📄" : "📊"} {f.name}
                </span>
                <span style={{ color: C.textSoft }}>{(f.size / 1024).toFixed(0)} KB</span>
              </div>
            ))}
          </div>
        )}

        {progress && (
          <div style={{
            marginTop: "14px", padding: "12px 16px",
            background: C.orangeXL, borderRadius: "9px",
            fontSize: "13px", color: C.orange, fontWeight: 600,
            border: `1px solid ${C.border2}`,
          }}>
            ⚙️ {progress}
          </div>
        )}

        <div style={{ marginTop: "20px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button style={S.btn("primary")} onClick={processFiles} disabled={!files.length || processing}>
            {processing ? "Processando..." : "✨ Extrair dados com IA"}
          </button>
          {files.length > 0 && !processing && (
            <button style={S.btn("ghost")} onClick={() => setFiles([])}>Limpar</button>
          )}
        </div>
      </div>

      <div style={S.card}>
        <div style={{ fontSize: "11px", fontWeight: 800, color: C.textMid, marginBottom: "16px", letterSpacing: "0.08em" }}>
          OU CADASTRAR MANUALMENTE
        </div>
        <ManualForm onAdd={(rec) => onRecordsExtracted([rec])} />
      </div>
    </div>
  );
}

function ManualForm({ onAdd }) {
  const [form, setForm] = useState(emptyRecord());
  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const submit = () => {
    if (!form.nome.trim()) return;
    onAdd({ ...form, status: "pendente" });
    setForm(emptyRecord());
  };
  const fields = [
    ["nome","Nome Completo"],["cpf","CPF"],["telefone","Telefone"],
    ["titulo","Título de Eleitor"],["zona","Zona Eleitoral"],["secao","Seção Eleitoral"],
  ];
  return (
    <div>
      <div style={{ ...S.grid2, marginBottom: "14px" }}>
        {fields.map(([k, lbl]) => (
          <div key={k}>
            <label style={S.label}>{lbl}</label>
            <input style={S.input} value={form[k]} onChange={set(k)} placeholder={lbl} />
          </div>
        ))}
      </div>
      <button style={S.btn("primary")} onClick={submit}>+ Adicionar</button>
    </div>
  );
}

function AdminView({ records, setRecords }) {
  const [pin, setPin] = useState("");
  const [auth, setAuth] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const updateRecord = (id, field, value) =>
    setRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  const removeRecord = (id) =>
    setRecords(prev => prev.filter(r => r.id !== id));

  const sendAll = async () => {
    const pending = records.filter(r => r.status !== "ok");
    if (!pending.length) return;
    setSending(true);
    let ok = 0, err = 0;
    for (const rec of pending) {
      try {
        await sendToSheets(rec);
        setRecords(prev => prev.map(r => r.id === rec.id ? { ...r, status: "ok" } : r));
        ok++;
      } catch {
        setRecords(prev => prev.map(r => r.id === rec.id ? { ...r, status: "erro" } : r));
        err++;
      }
    }
    setSending(false);
    showToast(`${ok} enviado(s)${err ? ` · ${err} erro(s)` : ""}`, err ? "warn" : "ok");
  };

  if (!auth) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: "60px" }}>
        <div style={{ ...S.card, width: "100%", maxWidth: "360px" }}>
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <div style={{
              width: 64, height: 64, borderRadius: "16px", margin: "0 auto 14px",
              background: C.orangeXL, border: `1.5px solid ${C.border2}`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px"
            }}>🔐</div>
            <div style={{ fontWeight: 800, fontSize: "16px", color: C.text }}>Acesso Restrito</div>
            <div style={{ fontSize: "12px", color: C.textSoft, marginTop: "4px" }}>
              Insira o PIN de administrador
            </div>
          </div>
          <label style={S.label}>PIN</label>
          <input
            style={{ ...S.input, textAlign: "center", fontSize: "24px", letterSpacing: "0.4em", marginBottom: "14px" }}
            type="password" maxLength={8} value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (pin === ADMIN_PIN) setAuth(true);
                else showToast("PIN incorreto", "err");
              }
            }}
            placeholder="••••"
          />
          <button style={{ ...S.btn("primary"), width: "100%", justifyContent: "center" }}
            onClick={() => { if (pin === ADMIN_PIN) setAuth(true); else showToast("PIN incorreto", "err"); }}>
            Entrar
          </button>
        </div>
        {toast && <div style={S.toast(toast.type)}>{toast.msg}</div>}
      </div>
    );
  }

  const pending = records.filter(r => r.status !== "ok").length;
  const sent    = records.filter(r => r.status === "ok").length;

  return (
    <div>
      <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
        {[["Total", records.length, C.orange], ["Pendentes", pending, C.amber], ["Enviados", sent, C.green]].map(([lbl, val, color]) => (
          <div key={lbl} style={{
            flex: 1, background: "#fff", border: `1px solid ${C.border}`,
            borderRadius: "14px", padding: "18px", textAlign: "center",
            boxShadow: "0 2px 12px rgba(160,80,20,0.06)",
          }}>
            <div style={{ fontSize: "32px", fontWeight: 800, color, lineHeight: 1 }}>{val}</div>
            <div style={{ fontSize: "11px", color: C.textSoft, marginTop: "6px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>{lbl}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button style={S.btn("primary")} onClick={sendAll} disabled={sending || !pending}>
          {sending ? "Enviando..." : `📤 Enviar ${pending} para o Sheets`}
        </button>
        <button style={S.btn("ghost")} onClick={() => exportCSV(records)}>
          ⬇️ Exportar CSV
        </button>
      </div>

      {records.length === 0 && (
        <div style={{ ...S.card, textAlign: "center", padding: "52px 24px" }}>
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>📋</div>
          <div style={{ fontSize: "14px", color: C.textMid, fontWeight: 600 }}>Nenhum cadastro ainda.</div>
          <div style={{ fontSize: "12px", color: C.textSoft, marginTop: "6px" }}>
            Use a aba "Enviar Documentos" para começar.
          </div>
        </div>
      )}

      {records.map(rec => (
        <RecordCard key={rec.id} rec={rec}
          onUpdate={updateRecord} onRemove={removeRecord}
          onSendOne={async (r) => {
            try {
              await sendToSheets(r);
              setRecords(prev => prev.map(x => x.id === r.id ? { ...x, status: "ok" } : x));
              showToast("Enviado com sucesso!", "ok");
            } catch { showToast("Erro ao enviar", "err"); }
          }}
        />
      ))}

      {toast && <div style={S.toast(toast.type)}>{toast.msg}</div>}
    </div>
  );
}

function RecordCard({ rec, onUpdate, onRemove, onSendOne }) {
  const [expanded, setExpanded] = useState(false);
  const [imgPreview, setImgPreview] = useState(null);
  const set = (k) => (e) => onUpdate(rec.id, k, e.target.value);

  const handleFotoChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    onUpdate(rec.id, "fotoFile", f);
    setImgPreview(URL.createObjectURL(f));
  };

  const borderColor = rec.status === "ok" ? C.green : rec.status === "erro" ? C.red : C.orangeL;

  return (
    <div style={{
      background: "#fff", border: `1px solid ${C.border}`,
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: "14px", marginBottom: "10px", overflow: "hidden",
      boxShadow: "0 2px 10px rgba(160,80,20,0.05)",
    }}>
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 18px", cursor: "pointer" }}
        onClick={() => setExpanded(p => !p)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <span style={S.badge(rec.status)}>
            {rec.status === "ok" ? "✓ Enviado" : rec.status === "erro" ? "✗ Erro" : "● Pendente"}
          </span>
          <span style={{ fontWeight: 700, fontSize: "14px", color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {rec.nome || "(sem nome)"}
          </span>
          {rec.cpf && <span style={{ fontSize: "12px", color: C.textSoft, whiteSpace: "nowrap" }}>{rec.cpf}</span>}
        </div>
        <span style={{ color: C.textSoft, fontSize: "12px", flexShrink: 0, marginLeft: "8px" }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 18px 18px" }}>
          <div style={{ height: "1px", background: C.border, marginBottom: "16px" }} />
          <div style={{ ...S.grid2, marginBottom: "12px" }}>
            {[
              ["nome","Nome Completo"],["cpf","CPF"],["telefone","Telefone"],
              ["titulo","Título de Eleitor"],["zona","Zona Eleitoral"],["secao","Seção Eleitoral"],
            ].map(([k, lbl]) => (
              <div key={k}>
                <label style={S.label}>{lbl}</label>
                <input style={S.input} value={rec[k] || ""} onChange={set(k)} />
              </div>
            ))}
          </div>

          {rec.observacoes && (
            <div style={{ marginBottom: "12px" }}>
              <label style={S.label}>Observações</label>
              <textarea style={{ ...S.input, minHeight: "60px", resize: "vertical" }}
                value={rec.observacoes || ""} onChange={set("observacoes")} />
            </div>
          )}

          <div style={{ marginBottom: "16px" }}>
            <label style={S.label}>Comprovante de Residência</label>
            {(imgPreview || rec.fotoUrl) && (
              <img src={imgPreview || rec.fotoUrl} alt="comprovante"
                style={{ display: "block", maxWidth: "240px", borderRadius: "8px",
                  marginBottom: "8px", border: `1px solid ${C.border}` }} />
            )}
            <label style={{ ...S.btn("ghost"), display: "inline-flex", cursor: "pointer" }}>
              📷 {imgPreview || rec.fotoUrl ? "Trocar foto" : "Adicionar foto"}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleFotoChange} />
            </label>
            {rec.fotoUrl && !imgPreview && (
              <a href={rec.fotoUrl} target="_blank" rel="noreferrer"
                style={{ marginLeft: "10px", fontSize: "12px", color: C.orange, textDecoration: "none" }}>
                Ver link ↗
              </a>
            )}
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {rec.status !== "ok" && (
              <button style={S.btn("primary")} onClick={() => onSendOne(rec)}>
                📤 Enviar para Sheets
              </button>
            )}
            <button style={S.btn("danger")} onClick={() => onRemove(rec.id)}>
              🗑 Remover
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("upload");
  const [records, setRecords] = useState([]);
  const [toast, setToast] = useState(null);

  const handleExtracted = (newRecs) => {
    setRecords(prev => [...prev, ...newRecs]);
    setToast({ msg: `✅ ${newRecs.length} cadastro(s) extraído(s)! Revise no Painel Admin.`, type: "ok" });
    setTimeout(() => setToast(null), 4000);
  };

  const pendingCount = records.filter(r => r.status !== "ok").length;

  return (
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button:disabled { opacity: 0.4; cursor: not-allowed; }
        input:focus, textarea:focus {
          border-color: ${C.orange} !important;
          box-shadow: 0 0 0 3px ${C.orangeXL} !important;
        }
      `}</style>

      <div style={S.header}>
        <div style={S.logo}>70</div>
        <div>
          <div style={S.headerTitle}>Campanha David Almeida 2026</div>
          <div style={S.headerSub}>Cadastro inteligente de apoiadores</div>
        </div>
        {records.length > 0 && (
          <div style={{ marginLeft: "auto", ...S.badge("pendente") }}>
            {records.length} registro{records.length !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      <div style={S.tabBar}>
        <button style={S.tab(tab === "upload")} onClick={() => setTab("upload")}>
          📤 Enviar Documentos
        </button>
        <button style={S.tab(tab === "admin")} onClick={() => setTab("admin")}>
          🛡 Painel Admin {pendingCount > 0 ? `(${pendingCount})` : ""}
        </button>
      </div>

      <div style={S.main}>
        {tab === "upload" && <UploadView onRecordsExtracted={handleExtracted} />}
        {tab === "admin"  && <AdminView records={records} setRecords={setRecords} />}
      </div>

      {toast && <div style={S.toast(toast.type)}>{toast.msg}</div>}
    </div>
  );
}
