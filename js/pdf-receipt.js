// สร้างเอกสาร PDF "ใบรับสินค้า / ใบส่งมอบเครื่องซ่อม" ให้ลูกค้าดาวน์โหลด/พิมพ์
// เพื่อนำมาแสดงต่อช่างตอนมารับเครื่องคืน (ใช้เฉพาะเคสที่สถานะ "completed")
// พึ่งพา jsPDF (โหลดผ่าน CDN ใน customer.html) ไม่มี build step

// ⚠️ แก้ข้อมูลบริษัทตรงนี้ให้เป็นของจริง (ที่อยู่ / เบอร์โทร / อีเมล)
// ถ้ามีไฟล์โลโก้จริง (png/jpg) สามารถแปลงเป็น base64 แล้วใช้ doc.addImage() แทน
// โลโก้เฟืองที่วาดด้วยเวกเตอร์ด้านล่างนี้ได้
const BRAND = {
  name: "GEARIX",
  sub: "ใบรับสินค้า",
  address: "ที่อยู่บริษัทของคุณ, กรุงเทพฯ 10xxx", // TODO: ใส่ที่อยู่จริง
  phone: "0X-XXX-XXXX",                          // TODO: ใส่เบอร์โทรจริง
  email: "contact@gearix.example",               // TODO: ใส่อีเมลจริง
  graphite: [28, 31, 34],
  yellow: [242, 183, 5],
  orange: [232, 89, 12],
  green: [61, 139, 95],
  slate: [107, 114, 128],
  line: [231, 226, 216],
};

// วาดโลโก้เฟือง (มาจากไอคอน bi-gear-fill ที่ใช้ในเว็บ) ด้วยเวกเตอร์ล้วน ไม่ต้องพึ่งไฟล์ภาพ
function drawGearLogo(doc, cx, cy, rOuter, rInner, teeth, color) {
  const totalSteps = teeth * 2;
  const pts = [];
  for (let i = 0; i < totalSteps; i++) {
    const angle = (i / totalSteps) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  const deltas = [];
  for (let i = 1; i < pts.length; i++) {
    deltas.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  }
  doc.setFillColor(color[0], color[1], color[2]);
  doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], "F", true);
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, rInner * 0.5, "F");
}

// ---------- Thai font (jsPDF's built-in fonts don't have Thai glyphs) ----------
// เราโหลดฟอนต์ Sarabun (Regular + Bold) จาก CDN แล้วฝังเข้าไปใน PDF ตอนสร้างเอกสาร
// แคชไว้ในตัวแปรนี้ เพื่อไม่ต้องโหลดซ้ำทุกครั้งที่กดพิมพ์ใบเสร็จ
let _thaiFontCache = null;

const THAI_FONT_URLS = {
  normal: "https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Regular.ttf",
  bold: "https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Bold.ttf",
};

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // ป้องกัน stack overflow กับไฟล์ใหญ่
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function loadThaiFontBase64() {
  if (_thaiFontCache) return _thaiFontCache;
  const [normalBuf, boldBuf] = await Promise.all([
    fetch(THAI_FONT_URLS.normal).then((r) => {
      if (!r.ok) throw new Error("โหลดฟอนต์ Sarabun Regular ไม่สำเร็จ");
      return r.arrayBuffer();
    }),
    fetch(THAI_FONT_URLS.bold).then((r) => {
      if (!r.ok) throw new Error("โหลดฟอนต์ Sarabun Bold ไม่สำเร็จ");
      return r.arrayBuffer();
    }),
  ]);
  _thaiFontCache = {
    normal: arrayBufferToBase64(normalBuf),
    bold: arrayBufferToBase64(boldBuf),
  };
  return _thaiFontCache;
}

function registerThaiFont(doc, fontBase64) {
  doc.addFileToVFS("Sarabun-Regular.ttf", fontBase64.normal);
  doc.addFont("Sarabun-Regular.ttf", "Sarabun", "normal");
  doc.addFileToVFS("Sarabun-Bold.ttf", fontBase64.bold);
  doc.addFont("Sarabun-Bold.ttf", "Sarabun", "bold");
}

function fmtDate(value) {
  if (!value) return "-";
  const dt = value.toDate ? value.toDate() : value;
  if (!(dt instanceof Date) || isNaN(dt)) return "-";
  return (
    dt.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }) +
    " " +
    dt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
  );
}

export async function generateReceiptPDF(caseData) {
  if (!window.jspdf) {
    console.error("jsPDF ยังไม่ถูกโหลด — ตรวจสอบว่ามี <script src='.../jspdf.umd.min.js'> ใน customer.html");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // โหลด + ฝังฟอนต์ไทยก่อนเริ่มวาดอะไรทั้งสิ้น
  let fontBase64;
  try {
    fontBase64 = await loadThaiFontBase64();
    registerThaiFont(doc, fontBase64);
  } catch (err) {
    console.error("โหลดฟอนต์ไทยไม่สำเร็จ ตัวอักษรไทยในเอกสารอาจแสดงผลผิดพลาด:", err);
  }
  const useThaiFont = !!fontBase64;
  // ใช้แทนทุกจุดที่เคยเรียก doc.setFont("helvetica", style)
  const setFont = (style) => doc.setFont(useThaiFont ? "Sarabun" : "helvetica", style === "bold" ? "bold" : "normal");

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;

  // ---------- header band ----------
  doc.setFillColor(...BRAND.graphite);
  doc.rect(0, 0, pageW, 32, "F");
  drawGearLogo(doc, margin + 7, 16, 7, 3.6, 8, BRAND.yellow);

  doc.setTextColor(255, 255, 255);
  setFont("bold");
  doc.setFontSize(18);
  doc.text(BRAND.name, margin + 18, 14);

  setFont("normal");
  doc.setFontSize(9);
  doc.setTextColor(210, 210, 210);
  doc.text(BRAND.sub, margin + 18, 20);

  doc.setFontSize(8);
  doc.setTextColor(190, 190, 190);
  doc.text(BRAND.address, pageW - margin, 12, { align: "right" });
  doc.text(`โทร ${BRAND.phone}  •  ${BRAND.email}`, pageW - margin, 17, { align: "right" });

  // ---------- title ----------
  let y = 42;
  doc.setTextColor(...BRAND.graphite);
  setFont("bold");
  doc.setFontSize(15);
  doc.text("ใบรับสินค้า / ใบส่งมอบเครื่องซ่อม", margin, y);
  doc.setDrawColor(...BRAND.orange);
  doc.setLineWidth(0.8);
  doc.line(margin, y + 2.5, pageW - margin, y + 2.5);

  y += 10;
  setFont("normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.slate);
  doc.text(`ออกเอกสารเมื่อ ${fmtDate(new Date())}`, margin, y);

  // ---------- case info box ----------
  y += 6;
  const boxTop = y;
  const boxH = 42;
  doc.setDrawColor(...BRAND.line);
  doc.setFillColor(246, 244, 239);
  doc.roundedRect(margin, boxTop, pageW - margin * 2, boxH, 2, 2, "FD");

  const col1X = margin + 6;
  const col2X = pageW / 2 + 4;
  let ry = boxTop + 9;

  function field(label, value, x, yy) {
    setFont("normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.slate);
    doc.text(label, x, yy);
    setFont("bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...BRAND.graphite);
    doc.text(String(value || "-"), x, yy + 5);
  }

  field("Case No.", caseData.caseNo, col1X, ry);
  field("ช่างผู้รับผิดชอบ", caseData.technicianName, col2X, ry);
  ry += 13;
  field("Serial Number (SN)", caseData.sn, col1X, ry);
  field("วันที่รับเครื่อง", fmtDate(caseData.createdAt), col2X, ry);
  ry += 13;
  field("อุปกรณ์", caseData.productName || caseData.device, col1X, ry);
  field("วันที่ซ่อมเสร็จ", fmtDate(caseData.completedAt || caseData.updatedAt), col2X, ry);

  y = boxTop + boxH + 8;

  // ---------- ข้อมูลลูกค้า (ครบถ้วนสำหรับยื่นรับเครื่อง) ----------
  setFont("bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...BRAND.graphite);
  doc.text("ข้อมูลลูกค้า", margin, y);
  y += 6;

  setFont("bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...BRAND.graphite);
  doc.text(String(caseData.customerName || "-"), margin, y);
  y += 5.5;

  const cPhone = String(caseData.customerPhone || "").trim();
  const cEmail = String(caseData.customerEmail || "").trim();
  const contactParts = [];
  if (cPhone) contactParts.push(`โทร: ${cPhone}`);
  if (cEmail) contactParts.push(`อีเมล: ${cEmail}`);

  if (contactParts.length) {
    setFont("normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.slate);
    doc.text(contactParts.join("   |   "), margin, y);
    y += 5;
  }

  if (caseData.customerAddress) {
    setFont("normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.slate);
    const addrLines = doc.splitTextToSize(`ที่อยู่: ${String(caseData.customerAddress)}`, pageW - margin * 2);
    doc.text(addrLines, margin, y);
    y += addrLines.length * 4.6 + 2;
  }

  y += 6;

  // ---------- repair note ----------
  const note = caseData.repairNote || {};
  setFont("bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...BRAND.graphite);
  doc.text("รายละเอียดการซ่อม", margin, y);
  y += 6;

  function noteBlock(label, value) {
    setFont("normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.slate);
    doc.text(label, margin, y);
    y += 4.5;
    setFont("normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...BRAND.graphite);
    const lines = doc.splitTextToSize(String(value || "-"), pageW - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 4.6 + 4;
  }
  noteBlock("สาเหตุที่เสีย", note.cause);
  noteBlock("ขั้นตอนการตรวจสอบ", note.inspection);
  noteBlock("วิธีแก้ไข", note.repair);
  noteBlock("อะไหล่ที่ใช้", note.part);
  noteBlock("หมายเหตุจากช่าง", note.note);

  // ---------- pickup notice ----------
  y += 2;
  const noticeH = 14;
  doc.setFillColor(255, 247, 224);
  doc.setDrawColor(...BRAND.yellow);
  doc.roundedRect(margin, y, pageW - margin * 2, noticeH, 2, 2, "FD");
  setFont("bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...BRAND.orange);
  doc.text("กรุณานำเอกสารนี้พร้อมบัตรประชาชน มาแสดงต่อเจ้าหน้าที่เพื่อรับสินค้าคืน", margin + 5, y + 6);
  setFont("normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.slate);
  doc.text("กรุณาตรวจสอบสภาพเครื่องก่อนเซ็นรับสินค้าทุกครั้ง", margin + 5, y + 11);

  y += noticeH + 16;

  // ---------- signatures ----------
  const sigW = (pageW - margin * 2 - 10) / 2;
  doc.setDrawColor(...BRAND.graphite);
  doc.setLineWidth(0.3);
  doc.line(margin, y, margin + sigW, y);
  doc.line(margin + sigW + 10, y, margin + sigW * 2 + 10, y);

  setFont("normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.graphite);
  doc.text("ลงชื่อผู้รับสินค้า (ลูกค้า)", margin, y + 5);
  doc.text("ลงชื่อผู้ส่งมอบ (เจ้าหน้าที่ / ช่าง)", margin + sigW + 10, y + 5);
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.slate);
  doc.text("วันที่ ____ / ____ / ______", margin, y + 11);
  doc.text("วันที่ ____ / ____ / ______", margin + sigW + 10, y + 11);

  // ---------- footer ----------
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.slate);
  doc.text(
    `เอกสารนี้ออกโดย ${BRAND.name} — เคส ${caseData.caseNo || ""}`,
    pageW / 2,
    pageH - 10,
    { align: "center" }
  );

  const fileName = `receipt-${(caseData.caseNo || "case").replace(/[^a-zA-Z0-9-]/g, "")}.pdf`;
  doc.save(fileName);
}
