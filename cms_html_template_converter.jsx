// CMS HTML → Template Converter
// React + TypeScript + Tailwind + shadcn/ui

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ---------------- utils/htmlCleaner ----------------
function cleanHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/\\n/g, " ")
    .replace(/[\n\r]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------------- utils/faqExtractor ----------------
interface FAQItem {
  question: string;
  answer: string;
}

function extractFaqs(container: HTMLElement): FAQItem[] {
  const faqs: FAQItem[] = [];

  // ---------------------------
  // Normalize FAQ headings → always H3
  // ---------------------------
  const allHeadings = Array.from(container.querySelectorAll("h2, h4, h5, h6"));

  allHeadings.forEach((el) => {
    const text = el.textContent?.trim().toLowerCase();
    if (text?.startsWith("q")) {
      const h3 = document.createElement("h3");
      h3.innerHTML = el.innerHTML;
      el.replaceWith(h3);
    }
  });

  // ---------------------------
  // 1. Standard <h3> + <p>
  // ---------------------------
  const h3s = Array.from(container.querySelectorAll("h3"));

  for (let i = 0; i < h3s.length; i++) {
    const h3 = h3s[i];
    const next = h3.nextElementSibling;

    if (next && next.tagName === "P") {
      if (faqs.length < 11) {
        faqs.push({
          question: h3.textContent || "",
          answer: next.innerHTML || "",
        });
      }

      h3.remove();
      next.remove();
    }
  }

  // ---------------------------
  // 2. Detect <p><strong>Q...</strong>Answer</p>
  // ---------------------------
  const paragraphs = Array.from(container.querySelectorAll("p"));

  paragraphs.forEach((p) => {
    const strong = p.querySelector("strong");

    if (strong && strong.textContent?.trim().toLowerCase().startsWith("q")) {
      if (faqs.length < 11) {
        const question = strong.textContent.replace(/q\.?/i, "").trim();

        // remove strong from clone to get answer
        const clone = p.cloneNode(true) as HTMLElement;
        const strongClone = clone.querySelector("strong");
        strongClone?.remove();

        const answer = clone.innerHTML.trim();

        faqs.push({ question, answer });
      }

      p.remove();
    }
  });

  // ---------------------------
  // 3. Marker-based FAQs (--faqs--)
  // ---------------------------
  const allNodes = Array.from(container.children);

  let markerEl: HTMLElement | null = null;

  for (const el of allNodes) {
    const text = el.textContent?.trim().toLowerCase();
    if (text === "--faqs--" || text?.includes("--faqs--")) {
      markerEl = el;
      break;
    }
  }

  if (markerEl) {
    let current = markerEl.nextElementSibling;
    const faqItems: HTMLElement[] = [];

    while (current) {
      if (current.tagName === "P" && current.textContent?.trim()) {
        faqItems.push(current as HTMLElement);
      }
      current = current.nextElementSibling;
    }

    for (let i = 0; i < faqItems.length; i += 2) {
      const q = faqItems[i];
      const a = faqItems[i + 1];

      if (!q || !a) break;

      if (faqs.length < 11) {
        faqs.push({
          question: q.textContent?.trim() || "",
          answer: a.innerHTML?.trim() || "",
        });
      }

      q.remove();
      a.remove();
    }

    markerEl.remove();
  }

  return faqs;
}

// ---------------- utils/htmlParser ----------------
function wrapTables(container: HTMLElement) {
  const tables = container.querySelectorAll("table");

  tables.forEach((table) => {
    const parentDiv = table.closest("div");

    const hasIdvClass =
      parentDiv && parentDiv.className.toLowerCase().includes("idv");

    const hasTd = table.querySelector("td") !== null;

    if (hasIdvClass || hasTd) {
      const wrapper = document.createElement("div");
      wrapper.className = "idv-table-wrapper";

      table.classList.add("idv-table");

      table.parentNode?.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    }
  });
}

function parseHtml(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const container = doc.body;

  const h1 = container.querySelector("h1");
  const title = h1?.textContent || "";
  if (h1) h1.remove();

  const firstP = container.querySelector("p");
  const intro = firstP?.innerHTML || "";
  if (firstP) firstP.remove();

  wrapTables(container);

  const faqs = extractFaqs(container);

  let content = cleanHtml(container.innerHTML)
    .replace(/class="([^"]*)"/g, "class='$1'")
    .replace(/data-cms-include="([^"]*)"/g, "data-cms-include='$1'")
    .replace(/data-cms-namespace="([^"]*)"/g, "data-cms-namespace='$1'");

  const faqCount = Math.min(faqs.length, 11);

  const faqSection = `<h2><b>Frequently Asked Questions</b></h2>${Array.from(
    { length: faqCount },
    (_, i) =>
      `<div data-cms-include='cms/components/faq-item.html' data-cms-namespace='cc${
        i + 1
      }'></div>`
  ).join("")}`;

  content = cleanHtml(content + faqSection);

  return { title, intro, content, faqs };
}

// ---------------- JsonViewer ----------------
function JsonViewer({ data }: { data: any }) {
  const handleCopy = async () => {
    const text = JSON.stringify(data, null, 2);

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <Button className="mb-3" onClick={handleCopy}>
          Copy JSON
        </Button>

        <pre className="overflow-x-auto bg-black text-green-400 p-4 rounded max-h-[400px]">
          {JSON.stringify(data, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}

// ---------------- HtmlEditor ----------------
function HtmlEditor({ html, onChange }: any) {
  const ref = useRef<HTMLDivElement>(null);

  const exec = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    handleChange();
  };

  const handleChange = () => {
    if (ref.current) {
      onChange(ref.current.innerHTML);
    }
  };

  const addLink = () => {
    const url = prompt("Enter URL");
    if (url) exec("createLink", url);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => exec("bold")}>Bold</Button>
          <Button onClick={() => exec("italic")}>Italic</Button>
          <Button onClick={() => exec("insertUnorderedList")}>UL</Button>
          <Button onClick={() => exec("insertOrderedList")}>OL</Button>
          <Button onClick={() => exec("formatBlock", "h2")}>H2</Button>
          <Button onClick={() => exec("formatBlock", "h3")}>H3</Button>
          <Button onClick={() => exec("formatBlock", "p")}>Paragraph</Button>
          <Button onClick={addLink}>Link</Button>
        </div>

        <div
          ref={ref}
          contentEditable
          onInput={handleChange}
          dangerouslySetInnerHTML={{ __html: html }}
          className="border rounded p-4 min-h-[250px] bg-white text-black"
        />
      </CardContent>
    </Card>
  );
}

// ---------------- CmsForm ----------------
function CmsForm({ form, setForm }: any) {
  const update = (key: string, value: string) => {
    setForm({ ...form, [key]: value });
  };

  return (
    <Card>
      <CardContent className="p-4 grid md:grid-cols-2 gap-3">
        <input
          className="border p-2"
          placeholder="Article Title"
          value={form.article_title || ""}
          onChange={(e) => update("article_title", e.target.value)}
        />

        <input
          className="border p-2"
          placeholder="Meta Title"
          value={form.meta_title || ""}
          onChange={(e) => update("meta_title", e.target.value)}
        />

        

        <input
          className="border p-2"
          placeholder="Article Image URL"
          value={form.article_img || ""}
          onChange={(e) => update("article_img", e.target.value)}
        />

        <input
          className="border p-2"
          placeholder="Article Image Alt"
          value={form.article_img_alt || ""}
          onChange={(e) => update("article_img_alt", e.target.value)}
        />

        <input
          className="border p-2"
          placeholder="Canonical URL"
          value={form.canonicalUrl || ""}
          onChange={(e) => update("canonicalUrl", e.target.value)}
        />

        <textarea
          className="border p-2"
          placeholder="Meta Description"
          value={form.meta_descr || ""}
          onChange={(e) => update("meta_descr", e.target.value)}
        />

        <textarea
          className="border p-2"
          placeholder="Head Extras"
          value={form.head_extras || ""}
          onChange={(e) => update("head_extras", e.target.value)}
        />
      </CardContent>
    </Card>
  );
}

// ---------------- MAIN COMPONENT ----------------
export default function CMSConverter() {
  const [inputHtml, setInputHtml] = useState("");
  const [parsed, setParsed] = useState<any>(null);
  const [form, setForm] = useState<any>({});

  const handleConvert = () => {
    const result = parseHtml(inputHtml);
    setParsed(result);
  };

  const updateContent = (html: string) => {
    if (!parsed) return;

    setParsed({
      ...parsed,
      content: cleanHtml(html),
    });
  };

  const buildJson = () => {
    if (!parsed) return {};

    const defaultHeadExtras = `<style>.idv-table-wrapper{max-width:78%;margin:16px auto;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;border:1px solid #e6eaf0;border-radius:8px;overflow:hidden;background:#fff}.idv-table{width:100%;border-collapse:collapse;table-layout:fixed}.idv-table thead th{background:#eef2ff;font-weight:700;font-size:16px;padding:12px 14px;color:#122433;border-bottom:1px solid #e6eaf0}.idv-table tbody td{padding:10px 14px;font-size:16px;color:#1f2937;border-bottom:1px solid #f0f2f5;word-break:break-word;text-align:center}.idv-table tbody tr:nth-child(even){background:#fafafa}p{text-align:justify}</style><script>function handleFloatingButtonClick(){if(window.widgetOpenOverlay){window.widgetOpenOverlay('bike')}}</script>`;

    const json: any = {
      article_title: form.article_title || parsed.title,
      article_intro: parsed.intro,
      article_content: cleanHtml(parsed.content),

      head_extras: form.head_extras || defaultHeadExtras,
      canonicalUrl: form.canonicalUrl || "",

      meta_gplus_img: form.article_img || "",
      meta_twitter_img: form.article_img || "",
      meta_og_image: form.article_img || "",

      article_img: form.article_img || "",
      article_img_alt: form.article_img_alt || form.meta_title || "",

      meta_title: form.meta_title || "",
      meta_gplus_title: form.meta_title || "",
      meta_twitter_title: form.meta_title || "",
      meta_og_title: form.meta_title || "",

      meta_descr: form.meta_descr || "",
      meta_gplus_desc: form.meta_descr || "",
      meta_twitter_descr: form.meta_descr || "",
      meta_og_desc: form.meta_descr || "",
    };

    const faqCount = Math.min(parsed.faqs.length, 11);

    for (let i = 1; i <= faqCount; i++) {
      json[`article_content-cc${i}-question`] = parsed.faqs[i - 1]?.question || "";
      json[`article_content-cc${i}-answer`] = parsed.faqs[i - 1]?.answer || "";
    }

    return json;
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold">CMS HTML → Template Converter</h1>

      <Card>
        <CardContent className="p-4 space-y-3">
          <textarea
            placeholder="Paste HTML article here"
            className="w-full border p-3 h-40"
            value={inputHtml}
            onChange={(e) => setInputHtml(e.target.value)}
          />

          <Button onClick={handleConvert}>Convert HTML</Button>
        </CardContent>
      </Card>

      <CmsForm form={form} setForm={setForm} />

      {parsed && (
        <>
          <HtmlEditor html={parsed.content} onChange={updateContent} />
          <JsonViewer data={buildJson()} />
        </>
      )}
    </div>
  );
}
