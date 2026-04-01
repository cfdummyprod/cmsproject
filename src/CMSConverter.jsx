// CMS HTML → Template Converter
// React + Tailwind + shadcn/ui (Simplified)

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ---------------- utils/htmlCleaner ----------------
function cleanHtml(html) {
  if (!html) return "";
  return html
    .replace(/\\n/g, " ")
    .replace(/[\n\r]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------------- utils/faqExtractor ----------------
function extractFaqs(container) {
  const faqs = [];

  // Normalize FAQ headings → always H3
  const allHeadings = Array.from(container.querySelectorAll("h2, h4, h5, h6"));

  allHeadings.forEach((el) => {
    const text = el.textContent?.trim().toLowerCase();
    if (text?.startsWith("q")) {
      const h3 = document.createElement("h3");
      h3.innerHTML = el.innerHTML;
      el.replaceWith(h3);
    }
  });

  // 1. Standard <h3> + <p>
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

  // 2. Detect <p><strong>Q...</strong>Answer</p>
  const paragraphs = Array.from(container.querySelectorAll("p"));

  paragraphs.forEach((p) => {
    const strong = p.querySelector("strong");

    if (strong && strong.textContent?.trim().toLowerCase().startsWith("q")) {
      if (faqs.length < 11) {
        const question = strong.textContent.replace(/q\.?/i, "").trim();

        // remove strong from clone to get answer
        const clone = p.cloneNode(true);
        const strongClone = clone.querySelector("strong");
        strongClone?.remove();

        const answer = clone.innerHTML.trim();

        faqs.push({ question, answer });
      }

      p.remove();
    }
  });

  // 3. Marker-based FAQs (--faqs--)
  const allNodes = Array.from(container.children);

  let markerEl = null;

  for (const el of allNodes) {
    const text = el.textContent?.trim().toLowerCase();
    if (text === "--faqs--" || text?.includes("--faqs--")) {
      markerEl = el;
      break;
    }
  }

  if (markerEl) {
    let current = markerEl.nextElementSibling;
    const faqItems = [];

    while (current) {
      const text = current.textContent?.trim().toLowerCase() || "";
      if (text === "--faqs ends" || text === "--faqs ends--") {
        const endMarker = current;
        current = null;
        endMarker.remove();
        break;
      }

      if (current.tagName === "P" && text) {
        faqItems.push(current);
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
function expandLists(container) {
  const lists = Array.from(container.querySelectorAll("ul, ol"));
  
  lists.forEach(list => {
    const listItems = Array.from(list.children).filter(child => child.tagName === "LI");
    if (listItems.length === 0) return;
    
    // If already properly structured as a single-item list with a <p>, skip
    if (listItems.length === 1 && listItems[0].querySelector("p")) return;
    
    const fragment = document.createDocumentFragment();
    
    listItems.forEach(li => {
      const wrapper = document.createElement(list.tagName);
      if (list.className) wrapper.className = list.className;
      
      const newLi = document.createElement("li");
      if (li.className) newLi.className = li.className;
      
      if (!li.querySelector("p")) {
        const p = document.createElement("p");
        while (li.firstChild) {
          p.appendChild(li.firstChild);
        }
        newLi.appendChild(p);
      } else {
        while (li.firstChild) {
          newLi.appendChild(li.firstChild);
        }
      }
      
      wrapper.appendChild(newLi);
      fragment.appendChild(wrapper);
    });
    
    list.parentNode.insertBefore(fragment, list);
    list.remove();
  });
}

function wrapTables(container) {
  const tables = container.querySelectorAll("table");

  tables.forEach((table) => {
    // 1. Wrap the table with the proper class wrapper
    const parent = table.parentElement;
    if (parent && !parent.className.includes("idv-table-wrapper")) {
      const wrapper = document.createElement("div");
      wrapper.className = "idv-table-wrapper";
      table.classList.add("idv-table");
      table.parentNode?.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    } else {
      table.classList.add("idv-table");
    }

    // Get all rows
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length === 0) return;

    // 2. Guarantee <thead> exists
    if (!table.querySelector("thead")) {
      const thead = document.createElement("thead");
      const headerRow = rows.shift(); // Pop first row
      thead.appendChild(headerRow);
      
      // Convert td to th, and strip bold/strong tags
      Array.from(headerRow.children).forEach(cell => {
        const th = document.createElement("th");
        th.innerHTML = cell.innerHTML.replace(/<\/?(strong|b)[^>]*>/gi, '').trim();
        cell.replaceWith(th);
      });
      
      table.insertBefore(thead, table.firstChild);
    }

    // 3. Guarantee <tbody> exists
    if (!table.querySelector("tbody")) {
      const tbody = document.createElement("tbody");
      rows.forEach(row => tbody.appendChild(row));
      table.appendChild(tbody);
    }

    // 4. Clean up junk inline styling from pastes and apply center alignment text
    Array.from(table.rows).forEach(row => {
      row.removeAttribute("style");
      
      Array.from(row.cells).forEach((cell, index) => {
        // Erase any generic junk from external rich text editors
        cell.removeAttribute("style");
        cell.removeAttribute("width");
        cell.removeAttribute("valign");
        cell.removeAttribute("height");

        // Apply centering inline for index 2 (3rd column) and onwards
        if (index >= 2) {
          cell.setAttribute("style", "text-align:center;");
        }
      });
    });
  });
}

function parseHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const container = doc.body;

  // Replace --banner-- shortcut with actual HTML
  const bannerRegex = /(?:<p>\s*)?--banner--(?:\s*<\/p>)?/gi;
  const bannerHtml = `<div class="insurance-banner" onclick="handleFloatingButtonClick()"><img src="https://cms-img.coverfox.com/red-car-cta-85x48.svg" alt="car" class="banner-icon" ><div class="banner-content"><span class="banner-message">Get your Car Insured online with Coverfox in minutes!</span></div><span class="banner-button">View Plans</span></div>`;
  container.innerHTML = container.innerHTML.replace(bannerRegex, bannerHtml);

  // Remove existing JSON-LD schemas to prevent duplicate stacking when re-pasting
  container.querySelectorAll("script[type='application/ld+json']").forEach(s => s.remove());

  // Remove existing FAQ titles since the converter automatically normalizes and appends one at the bottom
  Array.from(container.querySelectorAll("h1, h2, h3, h4, h5, h6, b, strong, p"))
    .filter(el => {
      const text = el.textContent.trim().toLowerCase();
      return text === "frequently asked questions" || text === "faqs";
    })
    .forEach(el => {
      // Find the parent heading if it exists and remove the entire block
      const heading = el.closest('h1, h2, h3, h4, h5, h6, p') || el;
      if (heading.parentNode) heading.remove();
    });

  const h1 = container.querySelector("h1");
  const title = h1?.textContent || "";
  if (h1) h1.remove();

  const firstP = container.querySelector("p");
  const intro = firstP?.innerHTML || "";
  if (firstP) firstP.remove();

  wrapTables(container);
  expandLists(container);

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
function JsonViewer({ data }) {
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

// ---------------- Schema Generator ----------------
function generateSchemas(parsed, form) {
  if (!parsed) return {};
  const schemas = {};

  // Table Schema
  const hasTable = parsed.content && parsed.content.includes("idv-table-wrapper");
  if (hasTable && form.table_schema_about) {
    schemas.table = {
      "@context": "https://schema.org",
      "@type": "Table",
      "about": form.table_schema_about
    };
  } else if (hasTable) {
    schemas.tableError = "Table detected in HTML, but 'Table Schema About Text' is missing. Schema will not be generated.";
  }

  // FAQ Schema
  if (parsed.faqs && parsed.faqs.length > 0) {
    const faqCount = Math.min(parsed.faqs.length, 11);
    const schemaEntities = [];
    let hasError = false;
    for (let i = 0; i < faqCount; i++) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = parsed.faqs[i].answer;
      
      const tempQ = document.createElement("div");
      tempQ.innerHTML = parsed.faqs[i].question;
      
      const qText = tempQ.textContent.trim();
      const aText = tempDiv.textContent.trim();
      
      if (!qText || !aText) {
        hasError = true;
      }

      schemaEntities.push({
        "@type": "Question",
        "name": qText,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": aText
        }
      });
    }
    
    if (schemaEntities.length > 0) {
      schemas.faq = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": schemaEntities
      };
      if (hasError) schemas.faqWarning = "Some FAQs have missing questions or answers.";
    }
  }

  return schemas;
}

// ---------------- HtmlEditor ----------------
function HtmlEditor({ html, faqs, schemas, onChange }) {
  const ref = useRef(null);
  const [activeTab, setActiveTab] = useState("visual");
  const [textModeHtml, setTextModeHtml] = useState(html);

  const exec = (e, command, value) => {
    e.preventDefault();
    if (activeTab === "visual" && ref.current) {
      ref.current.focus();
      document.execCommand(command, false, value);
      handleChange();
    }
  };

  const handleChange = () => {
    if (activeTab === "visual" && ref.current) {
      onChange(ref.current.innerHTML);
    }
  };

  const handleTextChange = (e) => {
    const val = e.target.value;
    setTextModeHtml(val);
    onChange(val);
  };

  const switchTab = (tab) => {
    if (tab === activeTab) return;
    
    if (tab === "text") {
      if (ref.current) setTextModeHtml(ref.current.innerHTML);
    }
    setActiveTab(tab);
  };

  const addLink = (e) => {
    e.preventDefault();
    if (activeTab !== "visual") return;
    const url = prompt("Enter URL");
    if (url) {
      if (ref.current) ref.current.focus();
      document.execCommand("createLink", false, url);
      handleChange();
    }
  };

  const addBanner = (e) => {
    e.preventDefault();
    if (activeTab !== "visual") return;
    const bannerHtml = `<div class="insurance-banner" onclick="handleFloatingButtonClick()"><img src="https://cms-img.coverfox.com/red-car-cta-85x48.svg" alt="car" class="banner-icon" ><div class="banner-content"><span class="banner-message">Get your Car Insured online with Coverfox in minutes!</span></div><span class="banner-button">View Plans</span></div><br/>`;
    
    if (ref.current) {
      ref.current.focus();
      document.execCommand("insertHTML", false, bannerHtml);
      handleChange();
    }
  };

  const EditorButton = ({ onMouseDown, className, children }) => (
    <button
      onMouseDown={onMouseDown}
      className={`px-2 py-1 text-[13px] bg-[#f6f7f7] border border-[#c3c4c7] hover:border-[#8c8f94] hover:bg-[#f0f0f1] rounded-[3px] shadow-sm text-[#3c434a] font-medium transition-colors ${className || ""}`}
    >
      {children}
    </button>
  );

  return (
    <div className="mb-6">
      {/* Editor header with tabs */}
      <div className="flex justify-end pr-1 gap-[2px]">
        <button 
          onClick={() => switchTab("visual")} 
          className={`px-3 py-1 text-[13px] border border-b-0 rounded-t-[3px] transition-colors relative z-10 ${
            activeTab === 'visual' 
              ? 'bg-[#f0f0f1] border-[#c3c4c7] border-b-[#f0f0f1] text-[#3c434a]' 
              : 'bg-[#ebebeb] border-[#ebebeb] text-[#2271b1] hover:bg-[#f0f0f1]'
          }`}
        >
          Visual
        </button>
        <button 
          onClick={() => switchTab("text")} 
          className={`px-3 py-1 text-[13px] border border-b-0 rounded-t-[3px] transition-colors relative z-10 ${
            activeTab === 'text' 
              ? 'bg-[#f0f0f1] border-[#c3c4c7] border-b-[#f0f0f1] text-[#3c434a]' 
              : 'bg-[#ebebeb] border-[#ebebeb] text-[#2271b1] hover:bg-[#f0f0f1]'
          }`}
        >
          Text
        </button>
        <button 
          onClick={() => switchTab("faqs")} 
          className={`px-3 py-1 text-[13px] border border-b-0 rounded-t-[3px] transition-colors relative z-10 ${
            activeTab === 'faqs' 
              ? 'bg-[#f0f0f1] border-[#c3c4c7] border-b-[#f0f0f1] text-[#3c434a]' 
              : 'bg-[#ebebeb] border-[#ebebeb] text-[#2271b1] hover:bg-[#f0f0f1]'
          }`}
        >
          FAQs Preview
        </button>
        <button 
          onClick={() => switchTab("schema")} 
          className={`px-3 py-1 text-[13px] border border-b-0 rounded-t-[3px] transition-colors relative z-10 flex gap-1 items-center ${
            activeTab === 'schema' 
              ? 'bg-[#f0f0f1] border-[#c3c4c7] border-b-[#f0f0f1] text-[#3c434a]' 
              : 'bg-[#ebebeb] border-[#ebebeb] text-[#2271b1] hover:bg-[#f0f0f1]'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path></svg>
          Schema Validator
        </button>
      </div>

      <div className="border border-[#c3c4c7] bg-[#f0f0f1] rounded-sm rounded-tr-none shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className={`flex flex-wrap gap-1 p-2 border-b border-[#c3c4c7] ${activeTab === 'text' ? 'hidden' : ''}`}>
           <EditorButton onMouseDown={(e) => exec(e, "bold")} className="font-bold">B</EditorButton>
           <EditorButton onMouseDown={(e) => exec(e, "italic")} className="italic font-serif">I</EditorButton>
           <EditorButton onMouseDown={(e) => exec(e, "insertUnorderedList")}>UL</EditorButton>
           <EditorButton onMouseDown={(e) => exec(e, "insertOrderedList")}>OL</EditorButton>
           <EditorButton onMouseDown={(e) => exec(e, "formatBlock", "h2")} className="font-semibold">H2</EditorButton>
           <EditorButton onMouseDown={(e) => exec(e, "formatBlock", "h3")} className="font-semibold">H3</EditorButton>
           <EditorButton onMouseDown={(e) => exec(e, "formatBlock", "p")}>P</EditorButton>
           <EditorButton onMouseDown={addLink} className="underline text-[#2271b1]">Link</EditorButton>
           <EditorButton onMouseDown={addBanner} className="font-bold text-[#fb641b]">Banner</EditorButton>
        </div>
        
        {/* Toolbar for Text Mode */}
        {activeTab === 'text' && (
          <div className="flex flex-wrap gap-1 p-2 border-b border-[#c3c4c7]">
            <span className="text-[12px] text-[#50575e] py-1 px-1">Raw HTML Editing</span>
          </div>
        )}

        <div className="bg-white">
          {activeTab === "schema" ? (
             <div className="p-4 min-h-[300px] bg-[#f0f0f1] text-[#3c434a] max-w-none text-[14px]">
               <h3 className="font-bold text-lg mb-4 text-[#2271b1]">Schema.org Validator Preview</h3>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {/* Table Schema */}
                 <div className="bg-white border shadow-sm rounded overflow-hidden">
                   <div className={`p-2 font-bold text-white ${schemas?.table ? 'bg-green-600' : schemas?.tableError ? 'bg-red-500' : 'bg-gray-500'}`}>
                      Table Schema {schemas?.table ? '✓ Valid' : schemas?.tableError ? '⚠ Error' : '(Not Found)'}
                   </div>
                   <div className="p-4">
                     {schemas?.table ? (
                       <pre className="text-xs bg-gray-50 p-2 border rounded overflow-x-auto text-green-700 whitespace-pre-wrap">
                         {JSON.stringify(schemas.table, null, 2)}
                       </pre>
                     ) : (
                       <p className="text-sm text-gray-500">{schemas?.tableError || "No tables detected in the HTML."}</p>
                     )}
                   </div>
                 </div>

                 {/* FAQ Schema */}
                 <div className="bg-white border shadow-sm rounded overflow-hidden">
                   <div className={`p-2 font-bold text-white ${schemas?.faqWarning ? 'bg-yellow-500' : schemas?.faq ? 'bg-green-600' : 'bg-gray-500'}`}>
                      FAQ Schema {schemas?.faqWarning ? '⚠ Warning' : schemas?.faq ? '✓ Valid' : '(Not Found)'}
                   </div>
                   <div className="p-4">
                     {schemas?.faq ? (
                       <>
                         {schemas?.faqWarning && <p className="text-sm text-yellow-600 mb-2 font-bold">{schemas.faqWarning}</p>}
                         <pre className="text-xs bg-gray-50 p-2 border rounded overflow-x-auto text-green-700 whitespace-pre-wrap">
                           {JSON.stringify(schemas.faq, null, 2)}
                         </pre>
                       </>
                     ) : (
                       <p className="text-sm text-gray-500">No FAQs detected in the HTML.</p>
                     )}
                   </div>
                 </div>
               </div>
             </div>
          ) : activeTab === "faqs" ? (
             <div className="p-4 min-h-[300px] bg-[#f0f0f1] text-[#3c434a] max-w-none text-[14px]">
               <h3 className="font-bold text-lg mb-4 text-[#2271b1]">FAQ Extraction Preview ({Math.min((faqs||[]).length, 11)} items)</h3>
               {(!faqs || faqs.length === 0) ? (
                 <p className="italic text-gray-500">No FAQs were detected in the input HTML.</p>
               ) : (
                 <div className="space-y-4">
                   {faqs.map((faq, i) => (
                     <div key={i} className={`p-4 bg-white border border-[#c3c4c7] rounded shadow-sm ${i >= 11 ? 'opacity-50' : ''}`}>
                       <h4 className="font-bold text-[#1d2327] mb-2">Q{i+1}: {faq.question}</h4>
                       <div className="text-[#3c434a]" dangerouslySetInnerHTML={{ __html: faq.answer }}></div>
                     </div>
                   ))}
                 </div>
               )}
             </div>
          ) : activeTab === "visual" ? (
            <div
              ref={ref}
              contentEditable
              onInput={handleChange}
              onBlur={handleChange}
              dangerouslySetInnerHTML={{ __html: textModeHtml }}
              className="p-4 min-h-[300px] outline-none text-[#3c434a] max-w-none"
              style={{ fontFamily: "'Georgia', serif", fontSize: "16px", lineHeight: "1.6" }}
            />
          ) : (
            <textarea
              value={textModeHtml}
              onChange={handleTextChange}
              className="w-full p-4 min-h-[300px] outline-none resize-y font-mono text-[13px] text-[#3c434a] border-0"
              style={{ backgroundColor: "#f6f7f7", lineHeight: "1.5" }}
              spellCheck="false"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- CmsForm ----------------
function CmsForm({ form, setForm }) {
  const update = (key, value) => {
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

        <input
          className="border p-2"
          placeholder="Table Schema About Text"
          title="Text that will populate the 'about' property in the inserted application/ld+json script for the table"
          value={form.table_schema_about || ""}
          onChange={(e) => update("table_schema_about", e.target.value)}
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
  const [parsed, setParsed] = useState(null);
  const [form, setForm] = useState({});
  const [showHelp, setShowHelp] = useState(false);

  const handleConvert = () => {
    const result = parseHtml(inputHtml);
    result.id = Date.now();
    setParsed(result);
  };

  const updateContent = (html) => {
    if (!parsed) return;

    setParsed({
      ...parsed,
      content: html,
    });
  };

  const buildJson = () => {
    if (!parsed) return {};

    const tableStyles = `.idv-table-wrapper{max-width:78%;margin:16px auto;font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;border:1px solid #e6eaf0;border-radius:8px;overflow:hidden;background:#fff}.idv-table{width:100%;border-collapse:collapse;table-layout:fixed}.idv-table thead th{background:#eef2ff;font-weight:700;font-size:16px;padding:12px 14px;color:#122433;border-bottom:1px solid #e6eaf0}.idv-table tbody td{padding:10px 14px;font-size:16px;color:#1f2937;border-bottom:1px solid #f0f2f5;word-break:break-word;text-align:center}.idv-table tbody tr:nth-child(even){background:#fafafa}`;

    const newStyles = `.art-content p,.art-content .art-content__intro>*,h3,h4,.art-content ol>li{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif !important;color:#1f2937 !important;font-size:16px !important;letter-spacing:0.019em;word-spacing:1px}h1{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif !important;font-size:32px !important}h2{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif !important;font-size:23px !important}.cfHeroBG__category{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif !important}.faq__question h3{font-size:18px;line-height:2px;margin:12px 0;word-break:break-word}@media (max-width:600px){.faq__question h3{font-size:23px;line-height:23px}}@media screen and (min-width:768px){div[data-cms-namespace='bannerCTA'] .banner-container.cta-banner-v2{width:690px}}.insurance-banner{display:flex;align-items:center;justify-content:space-between;background:rgb(49,68,81);color:#fff;padding:0 16px;border-radius:8px;font-family:sans-serif;max-width:690px;width:100%;margin:0 auto;box-sizing:border-box;flex-wrap:wrap;gap:3px}.banner-icon{width:136px;height:56px;margin-bottom:-2px !important;margin-left:-24px}.banner-content{flex:1;min-width:0}.banner-message{line-height:1.4;word-break:break-word;font-size:17px;margin-left:-1px}.banner-button{background:rgb(251,100,27);border:none;color:#fff;padding:8px 14px;border-radius:16px;font-weight:bold;text-decoration:none;font-size:15px;white-space:nowrap;flex-shrink:0;transition:background .3s ease}.banner-button:hover{background:rgb(230,85,20)}@media (max-width:768px){.insurance-banner{flex-direction:column;align-items:flex-start;text-align:left}.banner-content{width:100%}.banner-button{width:100%;text-align:center;font-size:13px;padding:8px}}@media (max-width:480px){.banner-message{font-size:14px}.insurance-banner{flex-direction:column;align-items:flex-start;text-align:left;width:100%;padding-bottom:14px;margin-top:0}.banner-content{margin-top:-45px}img.banner-icon{width:55% !important;padding-top:39px;height:97px;margin-bottom:-38px !important}.banner-icon{width:28px;height:28px}.banner-message{display:inline-grid;font-size:19px;margin-top:0;padding-left:163px;padding-top:5px}.banner-button{margin-left:154px;width:181px;font-size:14px;padding:7px 35px}}`;

    const hasTable = parsed.content.includes("idv-table");
    const baseCss = `p{text-align:justify}${newStyles}${hasTable ? tableStyles : ""}`;

    const defaultHeadExtras = `<style>${baseCss}</style><script>function handleFloatingButtonClick(){if(window.widgetOpenOverlay){window.widgetOpenOverlay('bike')}}</script>`;

    // Prepare Title (strip any existing H1 to avoid doubling, then wrap)
    let rawTitle = cleanHtml(form.article_title || parsed.title);
    rawTitle = rawTitle.replace(/<\/?h1>/gi, "").trim();
    const finalTitle = `<h1>${rawTitle}</h1>`;

    // Process Content DOM to enforce H2 styling
    const exportDiv = document.createElement("div");
    exportDiv.innerHTML = parsed.content;
    exportDiv.querySelectorAll("h2").forEach((h2) => {
      h2.style.fontSize = "22px";
    });

    // Purge any existing LD-JSON scripts inside the editor DOM right before building 
    // to ensure no duplicates exist before injecting the pristine payloads
    exportDiv.querySelectorAll("script[type='application/ld+json']").forEach(s => s.remove());

    // Inject schemas safely via utility
    const generatedSchemas = generateSchemas(parsed, form);

    if (generatedSchemas.table) {
      const tableWrapper = exportDiv.querySelector(".idv-table-wrapper");
      if (tableWrapper) {
        const scriptEl = document.createElement("script");
        scriptEl.type = "application/ld+json";
        scriptEl.textContent = JSON.stringify(generatedSchemas.table);
        tableWrapper.parentNode.insertBefore(scriptEl, tableWrapper.nextSibling);
      }
    }

    if (generatedSchemas.faq) {
      const faqNodes = Array.from(exportDiv.querySelectorAll("h2")).filter(
        el => el.textContent.includes("Frequently Asked Questions")
      );
      if (faqNodes.length > 0) {
        const scriptEl = document.createElement("script");
        scriptEl.type = "application/ld+json";
        scriptEl.textContent = JSON.stringify(generatedSchemas.faq);
        faqNodes[0].parentNode.insertBefore(scriptEl, faqNodes[0].nextSibling);
      }
    }

    const finalContent = cleanHtml(exportDiv.innerHTML)
      .replace(/class="([^"]*)"/g, "class='$1'")
      .replace(/data-cms-include="([^"]*)"/g, "data-cms-include='$1'")
      .replace(/data-cms-namespace="([^"]*)"/g, "data-cms-namespace='$1'")
      .replace(/style="([^"]*)"/g, "style='$1'")
      .replace(/href="([^"]*)"/g, "href='$1'")
      .replace(/target="([^"]*)"/g, "target='$1'")
      .replace(/src="([^"]*)"/g, "src='$1'");

    const json = {
      article_title: finalTitle,
      article_intro: cleanHtml(parsed.intro),
      article_content: finalContent,

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
      const qText = cleanHtml(parsed.faqs[i - 1]?.question || "");
      json[`article_content-cc${i}-question`] = qText ? `<h3>${qText}</h3>` : "";
      json[`article_content-cc${i}-answer`] = cleanHtml(parsed.faqs[i - 1]?.answer || "");
    }

    return json;
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            CMS HTML → Template Converter
          </h1>
          <p className="text-sm text-gray-500 font-medium">Powering premium CMS transformations</p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => setShowHelp(!showHelp)}
          className="flex gap-2 items-center hover:bg-blue-50 hover:text-blue-600 transition-all border-blue-100"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          How it works
        </Button>
      </div>

      {showHelp && (
        <Card className="border-blue-200 bg-blue-50/30 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
          <CardContent className="p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
              <span className="p-1 bg-blue-600 rounded text-white text-xs">GUIDE</span>
              Converter Shortcuts & Automation
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
              <div className="space-y-2">
                <h3 className="font-bold text-blue-800">🚀 Shortcuts</h3>
                <ul className="space-y-2 list-none p-0">
                  <li className="flex gap-2"><code className="bg-white px-1 border border-blue-200 text-blue-600 rounded">--banner--</code> <span className="text-gray-600">Injects the Red Car Insurance Banner automatically.</span></li>
                  <li className="flex gap-2"><code className="bg-white px-1 border border-blue-200 text-blue-600 rounded">--faqs--</code> <span className="text-gray-600">Start of a manual FAQ block extraction section.</span></li>
                  <li className="flex gap-2"><code className="bg-white px-1 border border-blue-200 text-blue-600 rounded">--faqs ends--</code> <span className="text-gray-600">End of a manual FAQ block extraction section.</span></li>
                </ul>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-blue-800">📄 Formatting</h3>
                <ul className="space-y-2 list-none p-0">
                  <li className="flex items-start gap-2 text-gray-600">
                    <span className="text-blue-500 font-bold mt-1">✓</span>
                    <span><strong>Lists:</strong> Single or grouped lists are auto-expanded into individual <code>{"<ul><li><p>"}</code> layers.</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600">
                    <span className="text-blue-500 font-bold mt-1">✓</span>
                    <span><strong>Headings:</strong> H2 tags are auto-styled to <code>22px</code> in the final output.</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600">
                    <span className="text-blue-500 font-bold mt-1">✓</span>
                    <span><strong>Tables:</strong> Automatically given the <code>idv-table</code> class and wrapped in a CSS container.</span>
                  </li>
                </ul>
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-blue-800">⚡ Advanced Logic</h3>
                <ul className="space-y-2 list-none p-0">
                  <li className="flex items-start gap-2 text-gray-600">
                    <span className="text-blue-500 font-bold mt-1">✓</span>
                    <span><strong>Schema:</strong> Generates FAQ LD-JSON and Table LD-JSON (if Table About text is provided).</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-600">
                    <span className="text-blue-500 font-bold mt-1">✓</span>
                    <span><strong>Cleanup:</strong> Strips redundant schemas and duplicate "FAQ" titles during ingestion.</span>
                  </li>
                </ul>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-blue-100 flex justify-end">
              <Button size="sm" variant="ghost" onClick={() => setShowHelp(false)} className="text-blue-600 hover:text-blue-800">Close Guide</Button>
            </div>
          </CardContent>
        </Card>
      )}

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
          <HtmlEditor 
            key={parsed.id} 
            html={parsed.content} 
            faqs={parsed.faqs} 
            schemas={generateSchemas(parsed, form)}
            onChange={updateContent} 
          />
          <JsonViewer data={buildJson()} />
        </>
      )}
    </div>
  );
}
