const $ = (id) => document.getElementById(id);

const PROVIDERS = {
  agnes: {
    baseUrl: "https://apihub.agnes-ai.com/v1",
    imageEndpoint: "/images/generations",
    imageEditEndpoint: "/images/generations",
    videoEndpoint: "/videos",
    queryEndpoint: (id) => `/videos/${encodeURIComponent(id)}`,
    imageEditStyle: "agnes",
    defaults: {
      imageModel: "agnes-image-2.1-flash",
      videoModel: "agnes-video-v2.0",
      chatModel: "agnes-2.0-flash",
    },
    hint: "Agnes 已按当前可用格式适配，生图、生视频和聊天会继续使用现有请求方式。",
  },
  xai: {
    baseUrl: "https://api.x.ai/v1",
    imageEndpoint: "/images/generations",
    imageEditEndpoint: "/images/edits",
    videoEndpoint: "/videos/generations",
    queryEndpoint: (id) => `/videos/${encodeURIComponent(id)}`,
    imageEditStyle: "xai",
    videoStyle: "xai",
    defaults: {
      imageModel: "grok-imagine-image",
      videoModel: "",
      chatModel: "grok-4.20-reasoning",
    },
    hint: "Grok 预设会按模型自动切换生图或图片编辑端点；图生图请优先选择 grok-imagine-image-edit。",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    imageEndpoint: "/images/generations",
    imageEditEndpoint: "/images/edits",
    videoEndpoint: "/videos",
    queryEndpoint: (id) => `/videos/${encodeURIComponent(id)}`,
    imageEditStyle: "openai",
    defaults: {
      imageModel: "gpt-image-2",
      videoModel: "",
      chatModel: "",
    },
    hint: "OpenAI 预设使用 GPT Image 2。图片编辑在官方接口通常需要文件上传；URL 图生图更适合支持兼容 JSON 的中转接口。",
  },
  custom: {
    baseUrl: "",
    imageEndpoint: "/images/generations",
    imageEditEndpoint: "/images/edits",
    videoEndpoint: "/videos",
    queryEndpoint: (id) => `/videos/${encodeURIComponent(id)}`,
    imageEditStyle: "compatible",
    defaults: {},
    hint: "自定义接口会自动获取模型并按关键词分组。若中转站兼容 OpenAI 格式，通常可直接使用。",
  },
};

const MODELS = [
  { id: "agnes-image-2.1-flash", provider: "agnes", kind: "image", endpoint: "/images/generations", note: "图片端点成功，推荐生图" },
  { id: "agnes-image-2.0-flash", provider: "agnes", kind: "image", endpoint: "/images/generations", note: "图片端点成功，速度稳定" },
  { id: "agnes-image-1.2", provider: "agnes", kind: "image", endpoint: "/images/generations", note: "旧版图片模型" },
  { id: "agnes-video-v2.0", provider: "agnes", kind: "video", endpoint: "/videos", note: "视频端点成功，异步任务" },
  { id: "agnes-video-v1.2", provider: "agnes", kind: "video", endpoint: "/videos", note: "旧版视频模型" },
  { id: "agnes-2.0-flash", provider: "agnes", kind: "chat", endpoint: "/chat/completions", note: "聊天端点成功" },
  { id: "agnes-1.5-flash", provider: "agnes", kind: "chat", endpoint: "/chat/completions", note: "聊天模型，适合快速测试" },
  { id: "grok-imagine-image", provider: "xai", kind: "image", endpoint: "/images/generations", note: "Grok 文生图" },
  { id: "grok-imagine-image-edit", provider: "xai", kind: "image", endpoint: "/images/edits", note: "Grok 图生图 / 图片编辑" },
  { id: "grok-imagine-image-quality", provider: "xai", kind: "image", endpoint: "/images/generations", note: "Grok 高质量图片模型" },
  { id: "grok-imagine-video", provider: "xai", kind: "video", endpoint: "/videos/generations", note: "Grok Imagine 视频模型" },
  { id: "grok-4.20-reasoning", provider: "xai", kind: "chat", endpoint: "/chat/completions", note: "Grok 推理模型" },
  { id: "gpt-image-2", provider: "openai", kind: "image", endpoint: "/images/generations", note: "GPT Image 2" },
];

let state = { mode: "image" };
const modeLogs = {
  image: { json: {}, request: { method: "POST", endpoint: "/images/generations", payload: {} }, open: false },
  video: { json: {}, request: { method: "POST", endpoint: "/videos", payload: {} }, open: false },
  chat: { json: {}, request: { method: "POST", endpoint: "/chat/completions", payload: {} }, open: false },
  query: { json: {}, request: { method: "GET", endpoint: "/videos/{task_id}", payload: null }, open: false },
};
let lastJson = modeLogs.image.json;
let lastRequest = modeLogs.image.request;
let pollTimer = null;
let pollingTaskId = "";
let timerInterval = null;
let startedAt = 0;
let completedItems = [];
let customProviders = [];
let providerSettings = {};
let activeProviderId = "agnes";
let chatMessages = [];
let autoFetchTimer = null;
let lastAutoFetchKey = "";
let originalButtonTexts = new Map();
let fakeProgressTimer = null;
let fakeProgressValue = 0;
const uploadedRefs = {
  image: [],
  video: [],
  chat: [],
};
const COMPLETED_KEY = "not1a-agnes-completed-items";
const CUSTOM_PROVIDERS_KEY = "not1a-custom-providers";
const PROVIDER_SETTINGS_KEY = "not1a-provider-settings";

init();

function init() {
  loadCompletedItems();
  loadCustomProviders();
  loadProviderSettings();
  renderProviderOptions();
  activeProviderId = $("provider").value;
  applyStoredProviderSettings();
  setBaseUrlLock();
  updateCustomProviderPanel();
  renderProviderHint();
  renderModelBoard();
  fillDatalists();
  bindTabs();
  bindForms();
  renderCompletedItems();
  renderChatTranscript();
  updateQuickSelections();
  updatePayloadEditor();
  document.body.dataset.mode = state.mode;
  updateResultActions();
  window.setTimeout(() => $("splash")?.classList.add("done"), 4500);
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
}

function setMode(mode) {
  syncActiveLogFromLegacy();
  state.mode = mode;
  document.body.dataset.mode = mode;
  const log = activeLog();
  lastJson = log.json;
  lastRequest = log.request;
  $("rawResult").classList.toggle("log-open", log.open);
  if ($("toggleChatLog")) $("toggleChatLog").textContent = "查看聊天日志";
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item.dataset.mode === mode));
  document.querySelectorAll(".mode-form").forEach((form) => form.classList.remove("active"));
  $(`${mode}Form`).classList.add("active");
  renderModelBoard();
  renderActiveLog();
  updatePayloadEditor();
  updateResultActions();
}

function bindForms() {
  $("provider").addEventListener("change", applyProviderPreset);
  $("fetchModels").addEventListener("click", fetchModelList);
  $("saveCustomProvider").addEventListener("click", saveCurrentCustomProvider);
  $("clearCustomProvider").addEventListener("click", clearCurrentCustomProvider);
  $("customProviderName").addEventListener("input", () => {
    updateCustomProviderPanel();
    saveCurrentProviderSettings();
  });
  $("apiKey").addEventListener("input", () => {
    saveCurrentProviderSettings();
    scheduleCustomModelFetch();
  });
  $("apiKey").addEventListener("blur", scheduleCustomModelFetch);
  bindQuickControls();
  bindReferenceUploads();
  $("imageMode").addEventListener("change", () => {
    syncImageModeWithRefs();
    renderProviderHint();
    updatePayloadEditor();
  });
  $("imageModel").addEventListener("input", () => {
    const modelId = $("imageModel").value.trim().toLowerCase();
    const model = MODELS.find((item) => item.id.toLowerCase() === modelId);
    applyImageModeForModel(modelId, model);
    syncImageModeWithRefs();
    renderProviderHint();
    syncModelCardSelection();
    updatePayloadEditor();
  });
  ["videoModel", "chatModel"].forEach((id) => {
    $(id).addEventListener("input", () => {
      renderProviderHint();
      syncModelCardSelection();
      updatePayloadEditor();
    });
  });
  $("imageForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      if ($("imageMode").value === "edit" && !lines($("imageRefs").value).length) {
        showError("图生图 / 编辑模式需要至少一个参考图 URL");
        return;
      }
      await sendBuiltRequest(buildImageRequest());
    } catch (error) {
      showError(error.message || String(error));
    }
  });
  $("videoForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await sendBuiltRequest(buildVideoRequest());
    } catch (error) {
      showError(error.message || String(error));
    }
  });
  $("chatForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await sendChatMessage();
    } catch (error) {
      showError(error.message || String(error));
    }
  });
  $("queryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await sendBuiltRequest(buildQueryRequest());
    } catch (error) {
      showError(error.message || String(error));
    }
  });
  $("pollTask").addEventListener("click", async () => {
    try {
      await pollVideoTask($("taskId").value.trim());
    } catch (error) {
      showError(error.message || String(error));
    }
  });
  ["input", "change"].forEach((eventName) => {
    document.querySelector(".workbench").addEventListener(eventName, (event) => {
      if (event.target.id !== "payloadEditor") updatePayloadEditor();
    });
  });
  $("baseUrl").addEventListener("input", () => {
    if (!isCustomProvider($("provider").value)) $("provider").value = "custom";
    setBaseUrlLock();
    updateCustomProviderPanel();
    renderProviderHint();
    saveCurrentProviderSettings();
    scheduleCustomModelFetch();
  });
  $("refreshPayload").addEventListener("click", updatePayloadEditor);
  $("copyCurl").addEventListener("click", async () => {
    try {
      await copyText(buildMaskedCurlCommand(), "已复制脱敏 cURL");
    } catch (error) {
      showError(`复制 cURL 失败：${error.message || String(error)}`);
    }
  });
  $("sendPayload").addEventListener("click", async () => {
    try {
      const payload = JSON.parse($("payloadEditor").value || "{}");
      await sendBuiltRequest({ ...currentRequestMeta(), payload });
    } catch (error) {
      showError(`请求体 JSON 格式不正确：${error.message}`);
    }
  });
  $("copyJson").addEventListener("click", async () => {
    if ($("copyJson").disabled) return;
    await copyText(JSON.stringify(lastJson, null, 2), "已复制响应");
  });
  $("downloadJson").addEventListener("click", () => {
    if ($("downloadJson").disabled) return;
    downloadActiveJson();
  });
  $("copyIssueReport").addEventListener("click", async () => {
    if ($("copyIssueReport").disabled) return;
    await copyText(buildIssueReport(), "已复制问题报告");
  });
  $("stopPolling").addEventListener("click", () => {
    if ($("stopPolling").disabled) return;
    stopPolling("已停止轮询");
    hideActivity();
    toast("已停止自动轮询");
  });
  $("toggleChatLog").addEventListener("click", () => {
    toggleActiveLog();
  });
  $("toggleResultLog").addEventListener("click", () => {
    toggleActiveLog();
  });
  $("clearCompleted").addEventListener("click", () => {
    completedItems = [];
    saveCompletedItems();
    renderCompletedItems();
    toast("已清空完成列表");
  });
}

function bindReferenceUploads() {
  bindReferenceUpload({
    kind: "image",
    inputId: "imageRefFiles",
    textareaId: "imageRefs",
    previewId: "imageRefPreview",
    clearId: "clearImageRefs",
  });
  bindReferenceUpload({
    kind: "video",
    inputId: "videoRefFiles",
    textareaId: "videoRefs",
    previewId: "videoRefPreview",
    clearId: "clearVideoRefs",
  });
  bindReferenceUpload({
    kind: "chat",
    inputId: "chatImageFiles",
    textareaId: "chatImages",
    previewId: "chatImagePreview",
    clearId: "clearChatImages",
  });
}

function bindReferenceUpload({ kind, inputId, textareaId, previewId, clearId }) {
  const input = $(inputId);
  const textarea = $(textareaId);
  const preview = $(previewId);
  if (!input || !textarea || !preview) return;

  input.addEventListener("change", async () => {
    await handleReferenceFiles(kind, [...input.files], textareaId, previewId);
    input.value = "";
  });
  textarea.addEventListener("input", () => syncUploadedRefsFromTextarea(kind, textareaId, previewId));
  textarea.addEventListener("change", () => syncUploadedRefsFromTextarea(kind, textareaId, previewId));
  if ($(clearId)) {
    $(clearId).addEventListener("click", () => clearUploadedRefs(kind, textareaId, previewId));
  }
  renderUploadedRefPreview(kind, textareaId, previewId);
}

async function handleReferenceFiles(kind, files, textareaId, previewId) {
  if (!files.length) return;
  const imageFiles = files.filter(isProbablyImageFile);
  const skipped = files.length - imageFiles.length;
  if (skipped) toast(`已跳过 ${skipped} 个非图片文件`);
  if (!imageFiles.length) return;

  const largeFiles = imageFiles.filter((file) => file.size > 10 * 1024 * 1024);
  if (largeFiles.length) toast("图片较大，发送时可能会慢一些");

  setStatus("正在读取参考图");
  let refs = [];
  try {
    refs = await Promise.all(imageFiles.map(readImageFile));
  } catch (error) {
    showError(error.message || String(error));
    return;
  }
  uploadedRefs[kind].push(...refs);
  appendTextareaLines($(textareaId), refs.map((item) => item.dataUrl));

  if (kind === "image" && $("imageMode")?.value !== "edit") {
    $("imageMode").value = "edit";
    syncImageModeWithRefs();
    renderProviderHint();
  }

  renderUploadedRefPreview(kind, textareaId, previewId);
  updatePayloadEditor();
  setStatus("就绪");
  toast(`已添加 ${refs.length} 张本机图片`);
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      let dataUrl = String(reader.result || "");
      const mime = file.type?.startsWith("image/") ? file.type : imageMimeFromName(file.name);
      if (mime && dataUrl.startsWith("data:") && !dataUrl.startsWith("data:image/")) {
        dataUrl = dataUrl.replace(/^data:[^;]*;/, `data:${mime};`);
      }
      resolve({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name || "本机图片",
        size: file.size || 0,
        dataUrl,
      });
    };
    reader.onerror = () => reject(new Error(`读取图片失败：${file.name || "未知文件"}`));
    reader.readAsDataURL(file);
  });
}

function isProbablyImageFile(file) {
  return file.type?.startsWith("image/") || Boolean(imageMimeFromName(file.name));
}

function imageMimeFromName(name = "") {
  const ext = String(name).toLowerCase().split(".").pop();
  const map = {
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp",
  };
  return map[ext] || "";
}

function appendTextareaLines(textarea, newLines) {
  const addition = newLines.filter(Boolean).join("\n");
  if (!addition) return;
  const existing = textarea.value.trim();
  textarea.value = existing ? `${existing}\n${addition}` : addition;
}

function syncUploadedRefsFromTextarea(kind, textareaId, previewId) {
  const textarea = $(textareaId);
  if (!textarea) return;
  const currentLines = new Set(lines(textarea.value));
  const before = uploadedRefs[kind].length;
  uploadedRefs[kind] = uploadedRefs[kind].filter((item) => currentLines.has(item.dataUrl));
  if (uploadedRefs[kind].length !== before) renderUploadedRefPreview(kind, textareaId, previewId);
}

function renderUploadedRefPreview(kind, textareaId, previewId) {
  const preview = $(previewId);
  if (!preview) return;
  const refs = uploadedRefs[kind] || [];
  preview.innerHTML = refs
    .map(
      (item) => `<article class="ref-thumb">
        <img src="${escapeAttr(item.dataUrl)}" alt="${escapeAttr(item.name)}" />
        <span title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</span>
        <small>${escapeHtml(formatFileSize(item.size))}</small>
        <button class="ghost danger" type="button" data-upload-kind="${escapeAttr(kind)}" data-upload-id="${escapeAttr(item.id)}">删除</button>
      </article>`,
    )
    .join("");
  preview.querySelectorAll("button[data-upload-id]").forEach((button) => {
    button.addEventListener("click", () => removeUploadedRef(kind, button.dataset.uploadId, textareaId, previewId));
  });
}

function removeUploadedRef(kind, id, textareaId, previewId) {
  const target = uploadedRefs[kind].find((item) => item.id === id);
  if (!target) return;
  uploadedRefs[kind] = uploadedRefs[kind].filter((item) => item.id !== id);
  removeTextareaLines($(textareaId), [target.dataUrl]);
  renderUploadedRefPreview(kind, textareaId, previewId);
  updatePayloadEditor();
  toast("已移除参考图");
}

function clearUploadedRefs(kind, textareaId, previewId) {
  const dataUrls = uploadedRefs[kind].map((item) => item.dataUrl);
  uploadedRefs[kind] = [];
  removeTextareaLines($(textareaId), dataUrls);
  renderUploadedRefPreview(kind, textareaId, previewId);
  updatePayloadEditor();
  toast("已清空本机上传的图片");
}

function removeTextareaLines(textarea, removeValues) {
  if (!textarea || !removeValues.length) return;
  const removeSet = new Set(removeValues);
  textarea.value = lines(textarea.value).filter((line) => !removeSet.has(line)).join("\n");
}

function formatFileSize(bytes) {
  if (!bytes) return "大小未知";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 1024 / 102.4) / 10} MB`;
}

function bindQuickControls() {
  document.querySelectorAll("[data-size]").forEach((button) => {
    button.addEventListener("click", () => {
      $("imageSize").value = button.dataset.size || $("imageSize").value;
      updateChipSelection("[data-size]", "size", $("imageSize").value);
      updatePayloadEditor();
      toast(`已切换尺寸：${$("imageSize").value}`);
    });
  });
  document.querySelectorAll("[data-quality]").forEach((button) => {
    button.addEventListener("click", () => {
      $("imageQuality").value = button.dataset.quality || "";
      updateChipSelection("[data-quality]", "quality", $("imageQuality").value);
      updatePayloadEditor();
      toast($("imageQuality").value ? `已切换画质：${$("imageQuality").value}` : "已使用默认画质");
    });
  });
  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      $("imagePrompt").value = button.dataset.prompt || "";
      updatePayloadEditor();
      toast("提示词已填入");
    });
  });
  ["imageSize", "imageQuality"].forEach((id) => {
    $(id).addEventListener("input", () => updateQuickSelections());
    $(id).addEventListener("change", () => updateQuickSelections());
  });
  updateQuickSelections();
}

function updateQuickSelections() {
  updateChipSelection("[data-size]", "size", $("imageSize")?.value || "");
  updateChipSelection("[data-quality]", "quality", $("imageQuality")?.value || "");
}

function updateChipSelection(selector, key, value) {
  document.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle("active", (button.dataset[key] || "") === value);
  });
}

function applyImageModeForModel(modelId, model) {
  const id = String(modelId || "").toLowerCase();
  const editOnly = isImageEditModel(id) || (model && model.endpoint === "/images/edits");
  $("imageMode").value = editOnly ? "edit" : "generate";
  syncImageModeWithRefs();
}

function renderModelBoard() {
  const filters = {
    image: ["image"],
    video: ["video"],
    chat: ["chat"],
    query: ["video"],
  };
  const filteredModels = visibleModels().filter((model) => filters[state.mode].includes(model.kind));
  if (!filteredModels.length) {
    $("modelBoard").innerHTML = `<p class="empty-state compact">当前栏目还没有可选模型，可获取模型列表或切换供应商。</p>`;
    return;
  }
  const groups = groupModelsBySeries(filteredModels);
  $("modelBoard").innerHTML = groups
    .map((group) => {
      const cards = group.models.map(modelCardHtml).join("");
      const selected = group.models.find((model) => selectedModelForKind(model.kind) === model.id);
      const selectedBadge = selected ? `<em title="${escapeAttr(selected.id)}">已选：${escapeHtml(selected.id)}</em>` : "";
      return `<details class="model-group">
        <summary>
          <span class="chevron">▸</span>
          <strong>${escapeHtml(group.label)}</strong>
          <span class="model-group-side">${selectedBadge}<small>${group.models.length} 个模型</small></span>
        </summary>
        <div class="model-group-body">${cards}</div>
      </details>`;
    })
    .join("");
  document.querySelectorAll(".model-card").forEach((card) => {
    card.addEventListener("click", () => {
      const kind = card.dataset.kind;
      const model = MODELS.find((item) => item.id === card.dataset.model);
      if (kind === "image") {
        $("imageModel").value = card.dataset.model;
        applyImageModeForModel(card.dataset.model.toLowerCase(), model);
      }
      if (kind === "video") $("videoModel").value = card.dataset.model;
      if (kind === "chat") $("chatModel").value = card.dataset.model;
      updatePayloadEditor();
      syncModelCardSelection();
      toast(`已选择模型：${card.dataset.model}`);
    });
  });
  syncModelCardSelection();
}

function modelCardHtml(model) {
  const selected = selectedModelForKind(model.kind) === model.id ? " selected" : "";
  return `<button class="model-card${selected}" type="button" data-model="${escapeAttr(model.id)}" data-kind="${escapeAttr(model.kind)}">
    <strong>${escapeHtml(model.id)}</strong>
    <span>${escapeHtml(model.endpoint)}</span>
    <small>${escapeHtml(model.note)}</small>
  </button>`;
}

function selectedModelForKind(kind) {
  if (kind === "image") return $("imageModel")?.value.trim() || "";
  if (kind === "video") return $("videoModel")?.value.trim() || "";
  if (kind === "chat") return $("chatModel")?.value.trim() || "";
  return "";
}

function syncModelCardSelection() {
  document.querySelectorAll(".model-card").forEach((card) => {
    card.classList.toggle("selected", selectedModelForKind(card.dataset.kind) === card.dataset.model);
  });
}

const SERIES_ORDER = [
  "Agnes 系列",
  "Grok 系列",
  "DeepSeek 系列",
  "GLM 系列",
  "Gemini 系列",
  "Qwen 系列",
  "GPT 系列",
  "GPT 生图系列",
  "Claude 系列",
  "Llama 系列",
  "Flux 系列",
  "Stable Diffusion 系列",
  "Midjourney 系列",
  "MiniMax / 海螺系列",
  "Kling / 可灵系列",
  "Luma 系列",
  "Runway 系列",
  "Mistral 系列",
  "Yi / 零一万物系列",
  "书生 InternLM 系列",
  "百川 Baichuan 系列",
  "腾讯混元系列",
  "科大讯飞星火系列",
  "阶跃星辰 Step 系列",
  "字节豆包/云雀系列",
  "其他系列"
];

function groupModelsBySeries(models) {
  const map = new Map();
  models.forEach((model) => {
    const key = modelSeriesKey(model.id);
    if (!map.has(key)) map.set(key, { label: key, models: [] });
    map.get(key).models.push(model);
  });
  return [...map.values()].sort((a, b) => {
    if (a.label === "其他系列" && b.label !== "其他系列") return 1;
    if (b.label === "其他系列" && a.label !== "其他系列") return -1;
    const indexA = SERIES_ORDER.indexOf(a.label);
    const indexB = SERIES_ORDER.indexOf(b.label);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.label.localeCompare(b.label, 'zh');
  });
}

function modelSeriesKey(id) {
  const value = id.toLowerCase();
  
  if (value.includes("agnes")) return "Agnes 系列";
  if (value.includes("grok") || value.includes("xai")) return "Grok 系列";
  if (value.includes("deepseek")) return "DeepSeek 系列";
  if (value.includes("glm") || value.includes("chatglm") || value.includes("cogview") || value.includes("zhipu")) return "GLM 系列";
  if (value.includes("gemini") || value.includes("google")) return "Gemini 系列";
  if (value.includes("qwen")) return "Qwen 系列";
  if (/(gpt[-_\s]*image|dall|dalle|gpt-4[-_\s]*image|gpt-4o[-_\s]*image)/.test(value)) return "GPT 生图系列";
  if (value.includes("gpt-4") || value.includes("gpt-3") || value.includes("o1") || value.includes("o3") || value.includes("openai") || value.startsWith("gpt-") || value.startsWith("o1-") || value.startsWith("o3-")) return "GPT 系列";
  if (value.includes("claude") || value.includes("anthropic")) return "Claude 系列";
  if (value.includes("llama") || value.includes("meta")) return "Llama 系列";
  if (value.includes("flux")) return "Flux 系列";
  if (value.includes("stable-diffusion") || value.includes("sdxl") || value.includes("sd3") || value.startsWith("sd-")) return "Stable Diffusion 系列";
  if (value.includes("midjourney") || value.includes("mj")) return "Midjourney 系列";
  if (value.includes("hailuo") || value.includes("minimax")) return "MiniMax / 海螺系列";
  if (value.includes("kling") || value.includes("kuaishou")) return "Kling / 可灵系列";
  if (value.includes("luma")) return "Luma 系列";
  if (value.includes("runway") || value.includes("gen-3") || value.includes("gen-2")) return "Runway 系列";
  if (value.includes("mistral") || value.includes("mixtral")) return "Mistral 系列";
  if (value.includes("yi-") || value.startsWith("yi-") || value.includes("lingyi")) return "Yi / 零一万物系列";
  if (value.includes("internlm") || value.includes("intern-")) return "书生 InternLM 系列";
  if (value.includes("baichuan")) return "百川 Baichuan 系列";
  if (value.includes("hunyuan")) return "腾讯混元系列";
  if (value.includes("spark") || value.includes("xfspark") || value.includes("xinghuo")) return "科大讯飞星火系列";
  if (value.includes("step") || value.includes("step-")) return "阶跃星辰 Step 系列";
  if (value.includes("doubao") || value.includes("skylark")) return "字节豆包/云雀系列";
  
  const parts = id.split(/[-_./]/);
  if (parts.length > 1 && parts[0].length >= 2) {
    const prefix = parts[0].toLowerCase();
    if (!/(chat|instruct|model|v1|v2|v3|v4|v5|v6|api|image|video|text|raw|final|new|test|free|online)/.test(prefix)) {
      return prefix.charAt(0).toUpperCase() + prefix.slice(1) + " 系列";
    }
  }
  return "其他系列";
}

function fillDatalists() {
  $("imageModels").innerHTML = visibleModels().filter((model) => model.kind === "image" && !isVectorModel(model.id))
    .map((model) => `<option value="${model.id}"></option>`)
    .join("");
  $("videoModels").innerHTML = visibleModels().filter((model) => model.kind === "video" && !isVectorModel(model.id))
    .map((model) => `<option value="${model.id}"></option>`)
    .join("");
  $("chatModels").innerHTML = visibleModels().filter((model) => model.kind === "chat" && !isVectorModel(model.id))
    .map((model) => `<option value="${model.id}"></option>`)
    .join("");
}

function visibleModels() {
  const provider = $("provider").value;
  return MODELS.filter((model) => model.provider === provider && !isVectorModel(model.id));
}

function providerConfig() {
  const providerId = $("provider").value;
  const saved = customProviders.find((item) => item.id === providerId);
  const settings = providerSettings[providerId] || {};
  if (saved) {
    return {
      ...PROVIDERS.custom,
      baseUrl: settings.baseUrl || saved.baseUrl,
      name: saved.name,
      hint: `${saved.name} 会按 OpenAI 兼容方式发送请求，并根据模型名自动选择生图、生视频或聊天分类。`,
    };
  }
  const preset = PROVIDERS[providerId] || PROVIDERS.custom;
  return {
    ...preset,
    baseUrl: settings.baseUrl || preset.baseUrl || "",
  };
}

function applyProviderPreset() {
  saveProviderSettingsFor(activeProviderId);
  const provider = providerConfig();
  const providerId = $("provider").value;
  activeProviderId = providerId;
  const settings = providerSettings[providerId] || {};
  if (providerId === "custom") {
    $("baseUrl").value = "";
    $("customProviderName").value = "";
    $("apiKey").value = "";
  } else {
    $("baseUrl").value = provider.baseUrl || "";
    $("apiKey").value = settings.apiKey || "";
    const saved = customProviders.find((item) => item.id === providerId);
    if (saved) $("customProviderName").value = settings.name || saved.name || "";
  }
  setBaseUrlLock();
  updateCustomProviderPanel();
  renderProviderHint();
  updateModelInputsFromVisibleList();
  applyImageModeForModel($("imageModel").value.trim().toLowerCase());
  updatePayloadEditor();
  renderModelBoard();
  fillDatalists();
  toast("已切换供应商预设");
  scheduleCustomModelFetch();
  
  // 自然对焦反馈
  if (isCustomProvider($("provider").value)) {
    if (!$("baseUrl").value) {
      $("baseUrl").focus();
    } else if ($("customProviderName").value === "我的自定义接口" || !$("customProviderName").value) {
      $("customProviderName").focus();
      $("customProviderName").select();
    } else {
      $("apiKey").focus();
    }
  }
}

function setBaseUrlLock() {
  const locked = !isCustomProvider($("provider").value);
  $("baseUrl").readOnly = locked;
  $("baseUrl").classList.toggle("readonly", locked);
}

function isCustomProvider(id) {
  return id === "custom" || id.startsWith("custom:");
}

function loadCustomProviders() {
  customProviders = loadStoredJson(CUSTOM_PROVIDERS_KEY, []);
}

function saveCustomProviders() {
  localStorage.setItem(CUSTOM_PROVIDERS_KEY, JSON.stringify(customProviders));
}

function loadProviderSettings() {
  providerSettings = loadStoredJson(PROVIDER_SETTINGS_KEY, {});
}

function saveProviderSettings() {
  localStorage.setItem(PROVIDER_SETTINGS_KEY, JSON.stringify(providerSettings));
}

function loadStoredJson(key, fallback) {
  try {
    const current = localStorage.getItem(key);
    return current ? JSON.parse(current) : fallback;
  } catch {
    return fallback;
  }
}

function applyStoredProviderSettings() {
  const providerId = $("provider").value;
  const settings = providerSettings[providerId] || {};
  const provider = providerConfig();
  $("baseUrl").value = settings.baseUrl || provider.baseUrl || "";
  $("apiKey").value = settings.apiKey || "";
  if (isCustomProvider(providerId)) {
    const saved = customProviders.find((item) => item.id === providerId);
    $("customProviderName").value = settings.name || saved?.name || "";
  }
}

function saveCurrentProviderSettings() {
  const providerId = $("provider")?.value;
  if (!providerId) return;
  saveProviderSettingsFor(providerId);
}

function saveProviderSettingsFor(providerId) {
  if (!providerId) return;
  const baseUrl = $("baseUrl")?.value.trim().replace(/\/+$/, "") || "";
  const apiKey = $("apiKey")?.value || "";
  const name = $("customProviderName")?.value.trim() || "";
  providerSettings[providerId] = {
    ...(providerSettings[providerId] || {}),
    baseUrl,
    apiKey,
    ...(isCustomProvider(providerId) ? { name } : {}),
  };
  saveProviderSettings();
}

function renderProviderOptions(selected = $("provider")?.value || "agnes") {
  const staticOptions = [
    ["agnes", "Agnes / APIHub"],
    ["xai", "Grok / xAI"],
    ["openai", "GPT Image / OpenAI"]
  ];
  const savedOptions = customProviders.map((item) => [item.id, item.name]);
  const customOption = [["custom", "新建 API 接口"]];
  const allOptions = [...staticOptions, ...savedOptions, ...customOption];
  $("provider").innerHTML = allOptions
    .map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`)
    .join("");
  $("provider").value = allOptions.some(([value]) => value === selected) ? selected : "agnes";
}

function updateCustomProviderPanel() {
  const custom = isCustomProvider($("provider").value);
  $("customProviderPanel").classList.toggle("visible", custom);
  $("saveCustomProvider").classList.toggle("visible", custom);
  $("clearCustomProvider").classList.toggle("visible", custom);
  if (!custom) return;
  const saved = customProviders.find((item) => item.id === $("provider").value);
  if (saved && document.activeElement !== $("customProviderName")) $("customProviderName").value = saved.name;
}

function saveCurrentCustomProvider() {
  const baseUrl = $("baseUrl").value.trim().replace(/\/+$/, "");
  const name = $("customProviderName").value.trim() || "我的自定义接口";
  const apiKey = $("apiKey").value;
  if (!baseUrl) {
    showError("请先填写接口地址");
    return;
  }
  const current = $("provider").value;
  const existing = customProviders.find((item) => item.id === current);
  if (existing) {
    existing.name = name;
    existing.baseUrl = baseUrl;
  } else {
    const id = `custom:${Date.now()}`;
    customProviders.push({ id, name, baseUrl });
    $("provider").value = id;
  }
  saveCustomProviders();
  const selected = existing ? existing.id : customProviders[customProviders.length - 1].id;
  providerSettings[selected] = { ...(providerSettings[selected] || {}), baseUrl, apiKey, name };
  saveProviderSettings();
  renderProviderOptions(selected);
  $("provider").value = selected;
  activeProviderId = selected;
  setBaseUrlLock();
  updateCustomProviderPanel();
  renderProviderHint();
  toast("自定义接口已保存");
}

function clearCurrentCustomProvider() {
  const current = $("provider").value;
  if (!isCustomProvider(current)) return;
  if (current.startsWith("custom:")) {
    customProviders = customProviders.filter((item) => item.id !== current);
    for (let index = MODELS.length - 1; index >= 0; index -= 1) {
      if (MODELS[index].provider === current) MODELS.splice(index, 1);
    }
    delete providerSettings[current];
    saveCustomProviders();
    saveProviderSettings();
    renderProviderOptions("custom");
    $("provider").value = "custom";
    activeProviderId = "custom";
  }
  $("baseUrl").value = "";
  $("apiKey").value = "";
  $("customProviderName").value = "";
  providerSettings.custom = { baseUrl: "", apiKey: "", name: "" };
  saveProviderSettings();
  setBaseUrlLock();
  updateCustomProviderPanel();
  renderProviderHint();
  renderModelBoard();
  fillDatalists();
  updatePayloadEditor();
  toast("自定义接口已清空");
}

function renderProviderHint() {
  if (!$("modeHint")) return;
  const provider = providerConfig();
  $("modeHint").innerHTML = `
    <div>
      <strong>${escapeHtml(provider.name || providerLabel($("provider").value))}</strong>
      <span>${escapeHtml(provider.hint || PROVIDERS.custom.hint)}</span>
    </div>
    <small>${escapeHtml(modeSummary())}</small>
  `;
}

function modeSummary() {
  if (state.mode === "image") {
    const mode = $("imageMode")?.value === "edit" ? "图生图 / 编辑" : "文生图";
    const model = $("imageModel")?.value.trim() || "未选择模型";
    return `${mode} · ${model} · ${imageEndpointForCurrentModel()}`;
  }
  if (state.mode === "video") {
    const model = $("videoModel")?.value.trim() || "未选择模型";
    return `生视频 · ${model} · ${providerConfig().videoEndpoint}`;
  }
  if (state.mode === "chat") {
    const model = $("chatModel")?.value.trim() || "未选择模型";
    return `聊天测试 · ${model} · ${providerConfig().chatEndpoint || "/chat/completions"}`;
  }
  const id = $("taskId")?.value.trim();
  return `任务查询 · ${id || "未输入任务 ID"} · ${id ? providerConfig().queryEndpoint(id) : "/videos/{task_id}"}`;
}

function imageEndpointForCurrentModel() {
  const provider = providerConfig();
  const model = MODELS.find((item) => item.id.toLowerCase() === ($("imageModel")?.value.trim().toLowerCase() || ""));
  if ($("imageMode")?.value === "edit") return model?.endpoint === "/images/edits" ? model.endpoint : provider.imageEditEndpoint;
  return model?.endpoint && model.kind === "image" ? model.endpoint : provider.imageEndpoint;
}

function syncImageModeWithRefs() {
  if (!$("imageRefs")) return;
  $("imageRefs").classList.toggle("refs-disabled", $("imageMode").value !== "edit");
}

function buildImageRequest() {
  const provider = providerConfig();
  const refs = lines($("imageRefs").value);
  const prompt = $("imagePrompt").value.trim();
  if (!prompt) throw new Error("请先输入图片提示词");
  const modelId = requireModel("imageModel", "图片");
  const payload = {
    model: modelId,
    prompt,
  };
  const mode = $("imageMode").value;
  if ($("imageSize").value.trim()) payload.size = $("imageSize").value.trim();
  if ($("imageQuality").value) payload.quality = $("imageQuality").value;
  addNumber(payload, "n", $("imageN").value);
  addNumber(payload, "seed", $("imageSeed").value);
  const selected = MODELS.find((item) => item.id.toLowerCase() === payload.model.toLowerCase());
  const endpoint = mode === "edit"
    ? (selected?.endpoint === "/images/edits" ? selected.endpoint : provider.imageEditEndpoint)
    : (selected?.kind === "image" && selected.endpoint ? selected.endpoint : provider.imageEndpoint);
  if (mode === "edit") {
    if (provider.imageEditStyle === "xai") {
      payload.image = refs.length === 1 ? xaiImageRef(refs[0]) : refs.map(xaiImageRef);
      return { method: "POST", endpoint, payload };
    }
    if (provider.imageEditStyle === "openai") {
      payload.images = refs.map((url) => ({ image_url: url }));
      return { method: "POST", endpoint, payload };
    }
    if (provider.imageEditStyle === "compatible") {
      payload.image = refs.length === 1 ? refs[0] : refs;
      return { method: "POST", endpoint, payload };
    }
    payload.tags = ["img2img"];
    payload.extra_body = { image: refs, response_format: "url" };
  }
  return { method: "POST", endpoint, payload };
}

function xaiImageRef(url) {
  return { type: "image_url", url };
}

function buildVideoRequest() {
  const provider = providerConfig();
  const refs = lines($("videoRefs").value);
  const prompt = $("videoPrompt").value.trim();
  if (!prompt) throw new Error("请先输入视频提示词");
  const modelId = requireModel("videoModel", "视频");
  const [width, height] = $("videoSize").value.split("x").map(Number);
  if (provider.videoStyle === "xai") {
    const frameRate = Number($("videoRate").value) || 24;
    const frames = Number($("videoFrames").value) || 81;
    const payload = {
      model: modelId,
      prompt,
      duration: Math.round(Math.max(1, frames / frameRate) * 10) / 10,
    };
    if (refs.length) payload.image = xaiImageRef(refs[0]);
    if ($("negativePrompt").value.trim()) payload.negative_prompt = $("negativePrompt").value.trim();
    return { method: "POST", endpoint: provider.videoEndpoint, payload };
  }
  const payload = {
    model: modelId,
    prompt,
    width,
    height,
  };
  addNumber(payload, "num_frames", $("videoFrames").value);
  addNumber(payload, "frame_rate", $("videoRate").value);
  if ($("negativePrompt").value.trim()) payload.negative_prompt = $("negativePrompt").value.trim();
  if (refs.length === 1) payload.image = refs[0];
  if (refs.length > 1) payload.extra_body = { image: refs, mode: "keyframes" };
  return { method: "POST", endpoint: provider.videoEndpoint, payload };
}

function buildChatRequest() {
  const provider = providerConfig();
  const imageUrls = lines($("chatImages").value);
  const text = $("chatPrompt").value.trim();
  if (!text) throw new Error("请先输入聊天消息");
  const modelId = requireModel("chatModel", "聊天");
  const content = chatContent(text, imageUrls);
  const history = chatMessages.map((message) => ({ role: message.role, content: message.content }));
  const payload = {
    model: modelId,
    messages: [...history, { role: "user", content }],
  };
  addNumber(payload, "temperature", $("temperature").value);
  return { method: "POST", endpoint: provider.chatEndpoint || "/chat/completions", payload };
}

function chatContent(text, imageUrls = []) {
  return imageUrls.length
    ? [
        { type: "text", text },
        ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
      ]
    : text;
}

async function sendChatMessage() {
  const imageUrls = lines($("chatImages").value);
  const text = $("chatPrompt").value.trim();
  if (!text) {
    showError("请先输入聊天消息");
    return;
  }
  requireModel("chatModel", "聊天");
  if (!hasConnection()) {
    showError("请先填写接口地址和 API Key");
    return;
  }
  const content = chatContent(text, imageUrls);
  chatMessages.push({ role: "user", content, text, images: imageUrls });
  renderChatTranscript({ thinking: true });
  $("chatPrompt").value = "";
  const request = buildChatRequestFromMessages();
  const data = await sendBuiltRequest(request);
  if (!data) {
    renderChatTranscript();
    return;
  }
  const reply = extractChatReply(data);
  chatMessages.push({ role: "assistant", content: reply, text: reply });
  renderChatTranscript();
}

function buildChatRequestFromMessages() {
  const provider = providerConfig();
  const modelId = requireModel("chatModel", "聊天");
  const payload = {
    model: modelId,
    messages: chatMessages.map((message) => ({ role: message.role, content: message.content })),
  };
  addNumber(payload, "temperature", $("temperature").value);
  return { method: "POST", endpoint: provider.chatEndpoint || "/chat/completions", payload };
}

function requireModel(inputId, label) {
  const modelId = $(inputId)?.value.trim() || "";
  if (!modelId) throw new Error(`${label}栏目还没有选择模型，请先选择模型或获取模型列表`);
  return modelId;
}

function hasConnection() {
  return Boolean($("baseUrl").value.trim() && $("apiKey").value.trim());
}

function extractChatReply(data) {
  const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.delta?.content ?? data?.output_text;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || item?.content || "")
      .filter(Boolean)
      .join("\n");
  }
  return JSON.stringify(data, null, 2);
}

function renderChatTranscript(options = {}) {
  if (!$("chatTranscript")) return;
  if (!chatMessages.length && !options.thinking) {
    $("chatTranscript").innerHTML = `<div class="chat-empty">消息会以气泡形式显示在这里。</div>`;
    return;
  }
  const messages = chatMessages
    .map((message) => {
      const isUser = message.role === "user";
      const text = message.text || contentToText(message.content);
      const images = message.images?.length
        ? `<div class="chat-image-links">${message.images.map((url) => `<a href="${escapeAttr(url)}" target="_blank" rel="noreferrer">${escapeHtml(shortenUrl(url))}</a>`).join("")}</div>`
        : "";
      return `<article class="chat-bubble ${isUser ? "user" : "assistant"}">
        <span>${isUser ? "你" : "助手"}</span>
        <p>${escapeHtml(text)}</p>
        ${images}
      </article>`;
    })
    .join("");
  const thinking = options.thinking
    ? `<article class="chat-bubble assistant thinking"><span>助手</span><p>正在生成回复...</p></article>`
    : "";
  $("chatTranscript").innerHTML = messages + thinking;
  $("chatTranscript").scrollTop = $("chatTranscript").scrollHeight;
}

function contentToText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item?.text || item?.image_url?.url || "").filter(Boolean).join("\n");
  return String(content || "");
}

function startFakeProgress() {
  stopFakeProgress();
  fakeProgressValue = 10;
  fakeProgressTimer = window.setInterval(() => {
    if (fakeProgressValue < 95) {
      const increment = Math.max(1, Math.round((95 - fakeProgressValue) / 10));
      fakeProgressValue += increment;
      $("taskPercent").textContent = `${fakeProgressValue}%`;
      $("taskBar").style.width = `${fakeProgressValue}%`;
    }
  }, 3000);
}

function stopFakeProgress() {
  if (fakeProgressTimer) {
    window.clearInterval(fakeProgressTimer);
    fakeProgressTimer = null;
  }
}

function buildQueryRequest() {
  const provider = providerConfig();
  const id = $("taskId").value.trim();
  if (!id) throw new Error("请先输入任务 ID");
  return { method: "GET", endpoint: provider.queryEndpoint(id), payload: null };
}

function currentRequestMeta() {
  const provider = providerConfig();
  if (state.mode === "image") {
    return { method: "POST", endpoint: imageEndpointForCurrentModel() };
  }
  if (state.mode === "video") return { method: "POST", endpoint: provider.videoEndpoint };
  if (state.mode === "chat") return { method: "POST", endpoint: provider.chatEndpoint || "/chat/completions" };
  const id = $("taskId").value.trim();
  return { method: "GET", endpoint: id ? provider.queryEndpoint(id) : "/videos/{task_id}" };
}

function buildMaskedCurlCommand(options = {}) {
  const payload = parsePayloadEditorForCurl();
  const request = {
    ...currentRequestMeta(),
    payload: options.sanitizePayload ? sanitizeForReport(payload) : payload,
  };
  const baseUrl = options.maskBaseUrl && isCustomProvider($("provider").value)
    ? "https://your-api.example/v1"
    : $("baseUrl").value.trim().replace(/\/+$/, "") || providerConfig().baseUrl || "https://example.com/v1";
  const endpoint = String(request.endpoint || "").replace(/^\/+/, "");
  const url = `${baseUrl}/${endpoint}`;
  const lines = [
    `curl ${shellQuote(url)} \\`,
    `  -X ${request.method || "POST"} \\`,
    "  -H 'Authorization: Bearer YOUR_API_KEY'",
  ];
  if ((request.method || "POST").toUpperCase() !== "GET") {
    lines[lines.length - 1] += " \\";
    lines.push("  -H 'Content-Type: application/json' \\");
    lines.push(`  -d ${shellQuote(JSON.stringify(request.payload || {}, null, 2))}`);
  }
  return lines.join("\n");
}

function parsePayloadEditorForCurl() {
  try {
    return JSON.parse($("payloadEditor").value || "{}");
  } catch {
    return activeRequest().payload || {};
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

async function copyText(text, successMessage = "已复制") {
  const value = String(text || "");
  try {
    await navigator.clipboard.writeText(value);
  } catch (error) {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw error;
  }
  toast(successMessage);
  setStatus("已复制");
}

function downloadActiveJson() {
  const log = activeLog();
  const exportData = {
    exported_at: new Date().toISOString(),
    mode: modeLabel(state.mode),
    provider: providerLabel($("provider").value),
    model: currentModelForMode() || "",
    request: log.request || lastRequest || currentRequestMeta(),
    response: log.json || {},
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `not1a-${state.mode}-${formatFileTimestamp()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  toast("已开始下载 JSON");
}

function buildIssueReport() {
  const log = activeLog();
  const request = log.request || lastRequest || currentRequestMeta();
  const response = sanitizeForReport(log.json || {});
  const lines = [
    "# 问题反馈",
    "",
    `时间：${new Date().toLocaleString()}`,
    `栏目：${modeLabel(state.mode)}`,
    `供应商：${providerLabel($("provider").value)}`,
    `模型：${currentModelForMode() || "未填写"}`,
    `接口：${request.method || "POST"} ${request.endpoint || ""}`,
    "",
    "## 现象",
    "请在这里补充你看到的问题、期望结果和实际结果。",
    "",
    "## 脱敏 cURL",
    "```bash",
    buildMaskedCurlCommand({ sanitizePayload: true, maskBaseUrl: true }),
    "```",
    "",
    "## 响应摘要",
    "```json",
    JSON.stringify(response, null, 2),
    "```",
  ];
  return lines.join("\n");
}

function sanitizeForReport(value, depth = 0, keyName = "") {
  if (depth > 6) return "[内容过深，已省略]";
  if (typeof value === "string") return sanitizeStringForReport(value, keyName);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => sanitizeForReport(item, depth + 1, keyName));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (isSensitiveKey(key)) return [key, "[已隐藏]"];
      return [key, sanitizeForReport(item, depth + 1, key)];
    }),
  );
}

function sanitizeStringForReport(value, keyName = "") {
  if (isSensitiveKey(keyName)) return "[已隐藏]";
  if (/^data:image\//i.test(value)) return `[本机图片数据已省略，长度 ${value.length}]`;
  if (/^https?:\/\//i.test(value)) return maskUrlForReport(value);
  if (value.length > 1200) return `${value.slice(0, 900)}\n...[长文本已截断，原长度 ${value.length}]`;
  return value;
}

function isSensitiveKey(keyName = "") {
  return /api[-_ ]?key|authorization|bearer|secret|token|password|passwd/i.test(keyName);
}

function maskUrlForReport(value) {
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.search = parsed.search ? "?..." : "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value;
  }
}

function modeLabel(mode) {
  return { image: "生图", video: "生视频", chat: "聊天测试", query: "查任务" }[mode] || mode;
}

function providerLabel(id) {
  const option = [...$("provider").options].find((item) => item.value === id);
  return option?.textContent || id || "未选择";
}

function currentModelForMode() {
  if (state.mode === "image") return $("imageModel")?.value.trim();
  if (state.mode === "video") return $("videoModel")?.value.trim();
  if (state.mode === "chat") return $("chatModel")?.value.trim();
  return "";
}

function formatFileTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function isVideoCreateEndpoint(endpoint) {
  return endpoint === providerConfig().videoEndpoint || endpoint === "/videos" || endpoint === "/videos/generations";
}

function activeRequest() {
  if (state.mode === "image") return buildImageRequest();
  if (state.mode === "video") return buildVideoRequest();
  if (state.mode === "chat") return buildChatRequest();
  return buildQueryRequest();
}

function updatePayloadEditor() {
  try {
    renderProviderHint();
    // 智能参考图提示态控制
    const isEdit = $("imageMode").value === "edit";
    const refsEl = $("imageRefs");
    if (refsEl) {
      if (isEdit) {
        refsEl.placeholder = "图生图模式：请输入参考图 URL（每行一个图片 URL）";
        refsEl.style.opacity = "1";
        refsEl.style.cursor = "text";
        refsEl.readOnly = false;
        refsEl.classList.remove("refs-disabled");
      } else {
        refsEl.placeholder = "当前为文生图模式，无需参考图；切换至图生图模式或点击带 -edit 的模型后在此输入";
        refsEl.style.opacity = "0.6";
        refsEl.style.cursor = "not-allowed";
        refsEl.readOnly = true;
        refsEl.classList.add("refs-disabled");
      }
    }

    const request = activeRequest();
    setActiveRequest(request);
    $("payloadEditor").value = JSON.stringify(request.payload || {}, null, 2);
    $("endpointLabel").textContent = `${request.method} ${request.endpoint}`;
  } catch (error) {
    setActiveRequest(currentRequestMeta());
    $("payloadEditor").value = "{}";
    $("endpointLabel").textContent = `${lastRequest.method} ${lastRequest.endpoint}`;
    renderProviderHint();
  }
}

async function sendBuiltRequest(request) {
  setActiveRequest(request);
  $("endpointLabel").textContent = `${request.method} ${request.endpoint}`;
  if (request.payload) $("payloadEditor").value = JSON.stringify(request.payload, null, 2);
  const baseUrl = $("baseUrl").value.trim().replace(/\/+$/, "");
  const apiKey = $("apiKey").value.trim();
  if (!baseUrl || !apiKey) {
    showError("请先填写接口地址和 API Key");
    return;
  }
  const data = await send(request.method, request.endpoint, request.payload, { activityRequest: request });
  if (request.endpoint.startsWith("/videos/") && data && !collectUrls(data).length) {
    showProgress(data);
    renderSkeleton("video");
  }
  if (isVideoCreateEndpoint(request.endpoint) && data) {
    const taskId = data.task_id || data.request_id || data.id;
    if (taskId) {
      $("taskId").value = taskId;
      toast("视频任务已提交，正在自动等待结果");
      await pollVideoTask(taskId);
    }
  }
  return data;
}

async function send(method, endpoint, payload, options = {}) {
  return sendRequest(method, endpoint, payload, options);
}

async function sendRequest(method, endpoint, payload, options = {}) {
  const baseUrl = $("baseUrl").value.trim().replace(/\/+$/, "");
  const apiKey = $("apiKey").value.trim();
  if (!baseUrl || !apiKey) {
    if (!options.silentErrors) showError("请先填写接口地址和 API Key");
    hideActivity();
    return;
  }

  setBusy(true);
  startTimer();
  if (!options.keepResult) clearResult();
  if (options.activityRequest) showActivityForRequest(options.activityRequest);
  
  const useProxy = window.location.protocol !== "file:" && window.location.hostname !== "";
  
  try {
    let response;
    if (useProxy) {
      response = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey, method, endpoint, payload }),
      });
    } else {
      const url = `${baseUrl}/${endpoint.replace(/^\/+/, "")}`;
      const headers = {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      };
      const fetchOpts = {
        method,
        headers,
      };
      if (method !== "GET" && payload !== null) {
        fetchOpts.body = JSON.stringify(payload);
      }
      response = await fetch(url, fetchOpts);
    }
    
    const text = await response.text();
    const data = parseJson(text);
    if (options.log !== false) setActiveJson(data);
    updateResultActions();
    if (!response.ok) {
      const errorMessage = normalizeErrorMessage(data, `请求失败：HTTP ${response.status}`);
      if (!options.silentErrors) {
        if (!options.keepResult || endpoint.startsWith("/videos/")) renderErrorCard(errorMessage, data);
        setStatus(`失败 ${response.status}`);
        toast(errorMessage);
      }
      return null;
    }
    if (!options.keepResult) renderResult(data);
    setStatus("成功");
    toast(successMessage(method, endpoint, data));
    return data;
  } catch (error) {
    if (!options.silentErrors) showError(error.message || String(error));
    return null;
  } finally {
    setBusy(false);
    if (!options.keepActivity && !(endpoint.startsWith("/videos/") && pollingTaskId)) hideActivity();
  }
}

async function fetchModelList() {
  if (!hasConnection()) {
    showError("请先填写接口地址和 API Key");
    return;
  }
  showActivity("正在获取模型列表", "正在向接口读取 /models，用于自动分类可用模型。", "query");
  const attempts = modelListEndpoints();
  let list = [];
  let usedEndpoint = attempts[0];
  for (const endpoint of attempts) {
    const data = await sendRequest("GET", endpoint, null, {
      keepResult: true,
      keepActivity: true,
      log: false,
      silentErrors: true,
    });
    list = extractModelIds(data);
    if (list.length) {
      usedEndpoint = endpoint;
      normalizeBaseUrlForModelEndpoint(endpoint);
      break;
    }
  }
  hideActivity();
  if (!list.length) {
    setStatus("未识别到模型");
    toast(`没有识别到模型列表，已尝试：${attempts.join("、")}`);
    return;
  }
  mergeModels(list, $("provider").value);
  fillDatalists();
  renderModelBoard();
  updateModelInputsFromVisibleList();
  renderProviderHint();
  updatePayloadEditor();
  toast(`已从 ${usedEndpoint} 获取 ${list.length} 个模型`);
}

function modelListEndpoints() {
  const endpoints = ["/models"];
  try {
    const parsed = new URL($("baseUrl").value.trim());
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!/(^|\/)v1$/i.test(path)) endpoints.push("/v1/models");
  } catch {
    endpoints.push("/v1/models");
  }
  return endpoints;
}

function normalizeBaseUrlForModelEndpoint(endpoint) {
  if (endpoint !== "/v1/models") return;
  try {
    const parsed = new URL($("baseUrl").value.trim());
    const path = parsed.pathname.replace(/\/+$/, "");
    if (/(^|\/)v1$/i.test(path)) return;
    parsed.pathname = `${path || ""}/v1`;
    parsed.search = "";
    parsed.hash = "";
    $("baseUrl").value = parsed.toString().replace(/\/$/, "");
    saveCurrentProviderSettings();
    renderProviderHint();
    toast("已自动补全接口路径 /v1");
  } catch {
    // 保持用户原输入，错误会在请求阶段提示。
  }
}

function scheduleCustomModelFetch() {
  window.clearTimeout(autoFetchTimer);
  autoFetchTimer = window.setTimeout(async () => {
    if (!isCustomProvider($("provider").value)) return;
    const baseUrl = $("baseUrl").value.trim();
    const apiKey = $("apiKey").value.trim();
    const signature = `${baseUrl}|${apiKey.slice(0, 8)}|${apiKey.length}`;
    if (!baseUrl || !apiKey || signature === lastAutoFetchKey) return;
    lastAutoFetchKey = signature;
    await fetchModelList();
  }, 650);
}

function extractModelIds(data) {
  const raw = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return raw
    .map((item) => (typeof item === "string" ? item : item?.id))
    .filter(Boolean);
}

function mergeModels(ids, provider) {
  const known = new Set(MODELS.filter((model) => model.provider === provider).map((model) => model.id));
  ids.forEach((id) => {
    if (known.has(id)) return;
    const kind = inferModelKind(id);
    if (!kind) return; // 排除过滤掉的无效模型
    MODELS.push({ id, provider, kind, endpoint: endpointForModelKind(kind, id), note: "从模型列表获取" });
    known.add(id);
  });
}

function inferModelKind(id) {
  const value = id.toLowerCase();
  const normalized = value.replace(/[\s_]+/g, "-");
  
  // 1. 过滤不需要的嵌入/向量/分类/审核等非生成式/非对话模型
  if (isVectorModel(value) || /(classifier|classification|moderation|moderate|scrub)/.test(value)) {
    return null;
  }
  // 过滤音频/语音模型 (除非明显是多模态对话模型，如 omni, audio-chat)
  if (/(whisper|tts|speech|audio-transcription|audio-translation|voice|music|bark|sound|sing)/.test(value)) {
    if (!/(chat|gpt|preview|omni|claude|gemini|deepseek|qwen|glm|instruct|lm|completions|talk)/.test(value)) {
      return null;
    }
  }

  // 2. 视频模型 (优先检测视频)
  // 包含 video, movie, sora, veo, wan, kling, runway, luma, cogvideo, animate, pixels, t2v, i2v, v2v, svd, video-gen, text2video, img2video 等
  if (/(video|movie|sora|veo|wan|kling|runway|luma|cogvideo|animate|pixels|t2v|i2v|v2v|svd|video-gen|text2video|img2video|image-to-video|text-to-video)/.test(normalized)) {
    // 如果名字里明显是聊天/对话/补全相关的模型，则归为聊天
    if (/(chat|instruct|talk|discussion|completions|assistant)/.test(value)) {
      return "chat";
    }
    return "video";
  }

  // 3. 图像生成/编辑模型
  // 包含 dall-e, dalle, flux, sd3, sdxl, stable-diffusion, midjourney, mj, ideogram, kolors, cogview, recraft, imagen, pages, aurora, playground, generations, draw, paint, creative, art, illustrate, design, t2i, i2i, imagine, txt2img, img2img, photo-gen 等
  const isImageGenKeyword = /(gpt-image|image-2|image-edit|image-generation|image-gen|dall-e|dalle|flux|sdxl|stable-diffusion|sd3|midjourney|mj|ideogram|kolors|cogview|recraft|imagen|pages|aurora|playground|generations|draw|paint|creative|art|illustrate|design|t2i|i2i|imagine|txt2img|img2img|photo-gen)/.test(normalized);
  const hasBasicImageWord = /(^|[-\s_./])(image|img|picture|photo|painting|visual)([-\s_./]|$)/.test(value);

  if (isImageGenKeyword || hasBasicImageWord) {
    if (hasBasicImageWord || normalized.includes("gpt-image")) return "image";
    // 区分多模态对话模型 (VLM): 名字里有 vision, vl, omni, llava, mllm, 11b-vision, 3.2-vision, 4o, 4-vision 等
    const isVlmChat = /(vision|vl|omni|llava|mllm)/.test(value) || /(-vl|-v\d| vl | v\d |4v|1.5-vl|3.2-vision|11b-vision|90b-vision)/.test(value);
    
    if (isVlmChat) {
      // 如果包含 generations/edit/imagine 等生图动作词，依然归为生图
      if (/(generations|edit|imagine|dall|flux|image-gen|image-2|gpt-image)/.test(value)) {
        return "image";
      }
      return "chat";
    }
    
    // 如果有明确的聊天/对话补全/推理等关键词，则是聊天
    if (/(chat|instruct|conversational|reasoning|completions|assistant|agent)/.test(value)) {
      return "chat";
    }
    
    return "image";
  }

  // 4. 默认分类为聊天
  return "chat";
}

function isVectorModel(id) {
  return /(embed|embedding|embeddings|rerank|reranker|re-rank|vector|vectors|similarity|bge|acge|e5-|jina-embeddings|text-embedding|sentence-transformer|sparse|dense|retrieval)/i.test(String(id || ""));
}

function endpointForModelKind(kind, id = "") {
  if (kind === "image") return isImageEditModel(id) ? providerConfig().imageEditEndpoint : providerConfig().imageEndpoint;
  if (kind === "video") return providerConfig().videoEndpoint;
  return providerConfig().chatEndpoint || "/chat/completions";
}

function isImageEditModel(id) {
  const value = String(id || "").toLowerCase().replace(/[\s_]+/g, "-");
  return /(image-edit|img2img|i2i|image-to-image|edit)/.test(value);
}

function updateModelInputsFromVisibleList() {
  const provider = providerConfig();
  const defaults = provider.defaults || {};
  const models = visibleModels();
  setModelInputValue("imageModel", "image", "imageModel", defaults, models);
  setModelInputValue("videoModel", "video", "videoModel", defaults, models);
  setModelInputValue("chatModel", "chat", "chatModel", defaults, models);
  applyImageModeForModel($("imageModel").value.trim().toLowerCase());
}

function setModelInputValue(inputId, kind, defaultKey, defaults, models) {
  if (Object.prototype.hasOwnProperty.call(defaults, defaultKey)) {
    $(inputId).value = defaults[defaultKey] || "";
    return;
  }
  const model = models.find((item) => item.kind === kind);
  $(inputId).value = model?.id || "";
}

async function pollVideoTask(taskId) {
  if (!taskId) throw new Error("输入任务 ID");
  stopPolling();
  pollingTaskId = taskId;
  updateResultActions();
  showProgress({ status: "queued", progress: 0, taskId });
  showActivity("视频生成中", "任务已提交至平台，系统正在每 5 秒自动查询一次进度。", "video");
  renderSkeleton("video");
  setStatus("生成中");

  const tick = async () => {
    const data = await send("GET", providerConfig().queryEndpoint(taskId), null, { keepResult: true, keepActivity: true });
    if (!data) {
      stopPolling("查询失败");
      hideActivity();
      return;
    }
    showProgress(data);
    const status = String(data.status || "").toLowerCase();
    if (isFinalStatus(status) || videoResultUrl(data) || collectUrls(data).length) {
      renderResult(data);
      stopPolling(isFailedFinalStatus(status) ? "生成失败" : "生成成功");
      hideActivity();
      return;
    }
    setStatus(status === "queued" ? "排队中" : "生成中");
    pollTimer = window.setTimeout(tick, 5000);
    updateResultActions();
  };

  await tick();
}

function stopPolling(message) {
  if (pollTimer) window.clearTimeout(pollTimer);
  pollTimer = null;
  pollingTaskId = "";
  stopFakeProgress();
  updateResultActions();
  if (message) setStatus(message);
}

function isFinalStatus(status) {
  return ["done", "completed", "complete", "succeeded", "success", "failed", "error", "expired", "cancelled", "canceled"].includes(status);
}

function isSuccessfulFinalStatus(status) {
  return ["done", "completed", "complete", "succeeded", "success"].includes(status);
}

function isFailedFinalStatus(status) {
  return ["failed", "error", "expired", "cancelled", "canceled"].includes(status);
}

function showProgress(data) {
  $("taskProgress").classList.remove("hidden");
  $("taskBar").style.backgroundColor = "";
  const urls = collectUrls(data);
  
  const statusMap = {
    "queued": "排队中",
    "in_progress": "生成中",
    "processing": "生成中",
    "running": "生成中",
    "done": "已完成",
    "completed": "已完成",
    "complete": "已完成",
    "succeeded": "已完成",
    "success": "已完成",
    "failed": "已失败",
    "expired": "已过期",
    "error": "错误",
    "cancelled": "已取消",
    "canceled": "已取消"
  };
  
  const status = data.status || "unknown";
  const displayStatus = statusMap[status.toLowerCase()] || status;
  const taskId = data.task_id || data.id || pollingTaskId || "未知";
  
  $("taskStatus").textContent = `${taskId} · ${displayStatus}`;
  const normalized = String(status).toLowerCase();
  $("taskProgress").classList.toggle("waiting", normalized === "queued");
  
  if (normalized === "queued") {
    if (!fakeProgressTimer) startFakeProgress();
    const queuedProgress = Math.max(fakeProgressValue || 12, 18);
    $("taskPercent").textContent = "排队中";
    $("taskBar").style.width = `${Math.min(45, queuedProgress)}%`;
    $("taskHint").textContent = "任务已提交，平台仍在排队；工具会继续自动等待。";
    return;
  }
  
  if (isFailedFinalStatus(normalized)) {
    stopFakeProgress();
    $("taskPercent").textContent = "失败";
    $("taskBar").style.width = "100%";
    $("taskBar").style.backgroundColor = "var(--accent-2)";
    $("taskHint").textContent = `生成失败: ${data.error || "未知错误"}`;
    return;
  }
  
  if (isFinalStatus(normalized) || urls.length) {
    stopFakeProgress();
    $("taskPercent").textContent = "100%";
    $("taskBar").style.width = "100%";
    $("taskBar").style.backgroundColor = "var(--accent)";
    $("taskHint").textContent = urls.length ? "已拿到视频链接。" : "视频已成功生成。";
    return;
  }
  
  const apiProgress = Number(data.progress ?? 0);
  const percent = apiProgress <= 1 ? Math.round(apiProgress * 100) : Math.round(apiProgress);
  
  if (percent > 0) {
    stopFakeProgress();
    $("taskPercent").textContent = `${Math.max(0, Math.min(100, percent))}%`;
    $("taskBar").style.width = `${Math.max(2, Math.min(100, percent || 2))}%`;
  } else {
    if (!fakeProgressTimer) {
      startFakeProgress();
    }
    $("taskPercent").textContent = `${fakeProgressValue || 10}%`;
    $("taskBar").style.width = `${fakeProgressValue || 10}%`;
  }
  
  $("taskHint").textContent = "正在生成，进度将自动更新，系统每 5 秒轮询一次。";
}

function renderResult(data) {
  setActiveJson(data);
  renderActiveLog();
  updateResultActions();
  const urls = collectUrls(data);
  rememberCompletedUrls(urls, data);
  if (!urls.length) {
    $("gallery").innerHTML = state.mode === "chat"
      ? ""
      : `<article class="empty-state result-empty">
        <strong>请求已返回</strong>
        <p>暂时没有识别到图片或视频链接。可展开日志查看平台返回的完整内容。</p>
      </article>`;
    return;
  }
  $("gallery").innerHTML = urls
    .map((url) => {
      const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url);
      const media = isVideo
        ? `<video controls src="${escapeAttr(url)}"></video>`
        : `<img src="${escapeAttr(url)}" alt="生成结果" />`;
      return `<article class="media-card">
        ${media}
        <div class="media-card-body">
          <span class="media-url" title="${escapeAttr(url)}">${escapeHtml(shortenUrl(url))}</span>
          <a class="ghost link-button" href="${escapeAttr(url)}" target="_blank" rel="noreferrer">打开完整链接</a>
        </div>
      </article>`;
    })
    .join("");
}

function rememberCompletedUrls(urls, data) {
  if (!urls.length) return;
  const model = data?.model || lastRequest?.payload?.model || "";
  const source = lastRequest?.endpoint || "";
  const freshItems = urls.map((url) => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    url,
    type: /\.(mp4|webm|mov)(\?|$)/i.test(url) ? "video" : "image",
    model,
    source,
    createdAt: new Date().toISOString(),
  }));
  const seen = new Set(completedItems.map((item) => item.url));
  completedItems = [...freshItems.filter((item) => !seen.has(item.url)), ...completedItems].slice(0, 80);
  saveCompletedItems();
  renderCompletedItems();
}

function loadCompletedItems() {
  completedItems = loadStoredJson(COMPLETED_KEY, []);
}

function saveCompletedItems() {
  localStorage.setItem(COMPLETED_KEY, JSON.stringify(completedItems));
}

function renderCompletedItems() {
  if (!completedItems.length) {
    $("completedList").innerHTML = `<p class="empty-state">完成后的图片和视频会自动出现在这里。</p>`;
    return;
  }
  $("completedList").innerHTML = completedItems
    .map((item) => {
      const label = item.type === "video" ? "视频" : "图片";
      const date = new Date(item.createdAt).toLocaleString();
      const preview =
        item.type === "video"
          ? `<video controls src="${escapeAttr(item.url)}"></video>`
          : `<img src="${escapeAttr(item.url)}" alt="已完成项目" />`;
      return `<article class="completed-item">
        ${preview}
        <div class="completed-body">
          <div class="completed-meta">
            <strong>${label}</strong>
            <span>${escapeHtml(item.model || "未知模型")}</span>
            <small>${escapeHtml(date)}</small>
          </div>
          <span class="media-url" title="${escapeAttr(item.url)}">${escapeHtml(shortenUrl(item.url))}</span>
          <div class="completed-actions">
            <button class="ghost copy-completed" type="button" data-url="${escapeAttr(item.url)}">复制链接</button>
            <a class="ghost link-button" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">打开完整链接</a>
          </div>
        </div>
      </article>`;
    })
    .join("");
  document.querySelectorAll(".copy-completed").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await copyText(button.dataset.url, "链接已复制");
      } catch (error) {
        showError(`复制链接失败：${error.message || String(error)}`);
      }
    });
  });
}

function collectUrls(value, found = []) {
  if (!value) return found;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) found.push(value);
    return [...new Set(found)];
  }
  if (Array.isArray(value)) value.forEach((item) => collectUrls(item, found));
  if (typeof value === "object") {
    if (typeof value.b64_json === "string") found.push(`data:image/png;base64,${value.b64_json}`);
    if (typeof value.result === "string" && /^[A-Za-z0-9+/=]+$/.test(value.result) && value.result.length > 200) {
      found.push(`data:image/png;base64,${value.result}`);
    }
    Object.values(value).forEach((item) => collectUrls(item, found));
  }
  return [...new Set(found)];
}

function videoResultUrl(data) {
  if (!data || typeof data !== "object") return "";
  const candidates = [
    data.url,
    data.video_url,
    data.output_url,
    data.asset_url,
    data.download_url,
    data.file_url,
    data.video?.url,
    data.video?.download_url,
    data.output?.url,
    data.output?.video_url,
    data.data?.url,
    data.data?.video_url,
    Array.isArray(data.output) ? data.output.find((item) => typeof item === "string" && /^https?:\/\//i.test(item)) : "",
    data.remixed_from_video_id,
    data.result,
  ];
  return candidates.find((item) => typeof item === "string" && /^https?:\/\//i.test(item)) || "";
}

function lines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function addNumber(payload, key, value) {
  if (value !== "") payload[key] = Number(value);
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function clearResult() {
  $("gallery").innerHTML = "";
  $("taskProgress").classList.add("hidden");
  $("taskBar").style.width = "0%";
  $("taskBar").style.backgroundColor = "";
  $("taskPercent").textContent = "0%";
  $("taskHint").textContent = "视频任务是异步生成，完成前不会返回视频文件。";
  setActiveJson({});
  renderActiveLog();
  updateResultActions();
}

function showError(message) {
  const errorText = normalizeErrorMessage(message);
  setActiveJson({ error: { message: errorText } });
  renderActiveLog();
  renderErrorCard(errorText);
  setStatus("出错");
  updateResultActions();
}

function renderErrorCard(message, detail) {
  const detailText = detail ? JSON.stringify(detail, null, 2) : "";
  $("gallery").innerHTML = `<article class="error-card">
    <strong>请求没有成功</strong>
    <p>${escapeHtml(message || "接口返回了错误，请查看日志确认完整响应。")}</p>
    ${detailText ? `<details><summary>查看错误摘要</summary><pre>${escapeHtml(detailText)}</pre></details>` : ""}
  </article>`;
}

function normalizeErrorMessage(value, fallback = "接口返回了错误，请查看日志确认完整响应。") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (value?.error?.message) return String(value.error.message);
  if (typeof value?.error === "string") return value.error;
  if (value?.message) return String(value.message);
  if (value?.detail) return String(value.detail);
  return fallback;
}

function setBusy(isBusy) {
  const submitButtons = isBusy
    ? document.querySelectorAll("form.active button[type='submit'], .chat-composer button[type='submit']")
    : document.querySelectorAll(".btn-loading, form button[type='submit'], .chat-composer button[type='submit']");

  if (isBusy) {
    submitButtons.forEach((btn) => {
      if (!originalButtonTexts.has(btn)) {
        originalButtonTexts.set(btn, btn.textContent);
      }
      btn.classList.add("btn-loading");
      btn.disabled = true;
      if (state.mode === "image") btn.textContent = "生成中...";
      else if (state.mode === "video") btn.textContent = "生成中...";
      else if (state.mode === "chat") btn.textContent = "发送中...";
      else btn.textContent = "处理中...";
    });
    document.body.classList.add("busy-state");
  } else {
    submitButtons.forEach((btn) => {
      if (originalButtonTexts.has(btn)) {
        btn.textContent = originalButtonTexts.get(btn);
        originalButtonTexts.delete(btn);
      }
      btn.classList.remove("btn-loading");
      btn.disabled = false;
    });
    document.body.classList.remove("busy-state");
  }

  document.querySelectorAll("button").forEach((button) => {
    if (
      !button.classList.contains("tab") &&
      !button.classList.contains("model-card") &&
      button.id !== "stopPolling" &&
      button.id !== "toggleResultLog" &&
      button.id !== "toggleChatLog" &&
      button.type !== "submit"
    ) {
      button.disabled = isBusy;
    }
  });

  updateResultActions();
  if (isBusy) setStatus("处理中");
}

function updateResultActions() {
  $("copyJson").disabled = !canCopyLastResponse();
  const hasLog = hasActiveLogData();
  $("downloadJson").disabled = !hasLog;
  $("copyIssueReport").disabled = !hasLog;
  $("stopPolling").disabled = !pollTimer && !pollingTaskId;
  const logOpen = activeLog().open;
  $("toggleResultLog").textContent = logOpen ? "隐藏日志" : "查看日志";
  if ($("toggleChatLog")) $("toggleChatLog").textContent = logOpen && state.mode === "chat" ? "隐藏聊天日志" : "查看聊天日志";
}

function hasActiveLogData() {
  const data = activeLog().json || {};
  return Boolean(data && typeof data === "object" && Object.keys(data).length);
}

function canCopyLastResponse() {
  if (!lastRequest || !lastJson || !Object.keys(lastJson).length) return false;
  if (lastJson.error || lastJson.raw || lastRequest.endpoint === "/models") return false;
  const endpoint = lastRequest.endpoint || "";
  if (endpoint === "/images/generations" || endpoint === "/images/edits") return collectUrls(lastJson).length > 0;
  if (isVideoCreateEndpoint(endpoint) || endpoint.startsWith("/videos/")) {
    const status = String(lastJson.status || "").toLowerCase();
    return collectUrls(lastJson).length > 0 || isSuccessfulFinalStatus(status);
  }
  if (endpoint === (providerConfig().chatEndpoint || "/chat/completions")) {
    return Boolean(lastJson?.choices?.length || lastJson?.output_text || lastJson?.message || lastJson?.content);
  }
  return true;
}

function setStatus(text) {
  $("status").textContent = text;
}

function showActivityForRequest(request) {
  if (request.endpoint === "/images/generations" || request.endpoint === "/images/edits") {
    showActivity("图片生成中", "请求已发送，通常需要 8 到 20 秒。结果返回后会自动展示图片。", "image");
    renderSkeleton("image");
    return;
  }
  if (isVideoCreateEndpoint(request.endpoint)) {
    showActivity("视频任务提交中", "先创建任务，再自动等待平台生成完整视频。", "video");
    renderSkeleton("video");
    return;
  }
  if (request.endpoint === (providerConfig().chatEndpoint || "/chat/completions")) {
    showActivity("正在思考", "聊天模型正在生成回复。", "chat");
    return;
  }
  showActivity("正在查询任务", "已向平台请求最新状态。", "query");
}

function showActivity(title, text, type = "default") {
  $("activity").className = `activity ${type}`;
  $("activityTitle").textContent = title;
  $("activityText").textContent = text;
}

function hideActivity() {
  $("activity").classList.add("hidden");
  stopTimer();
}

function renderSkeleton(type) {
  const count = type === "image" ? 2 : 1;
  const ratio = type === "video" ? ratioFromSize($("videoSize")?.value || "768x512") : ratioFromSize($("imageSize")?.value || "1024x768");
  $("gallery").innerHTML = Array.from({ length: count })
    .map(
      () => `<article class="media-card skeleton-card" style="--media-ratio: ${ratio};">
        <div class="skeleton-media"></div>
        <span class="skeleton-line"></span>
      </article>`,
    )
    .join("");
}

function ratioFromSize(size) {
  const [width, height] = String(size).split("x").map((item) => Number(item.trim()));
  if (!width || !height) return "4 / 3";
  return `${width} / ${height}`;
}

function activeLog() {
  return modeLogs[state.mode] || modeLogs.image;
}

function setActiveRequest(request) {
  const log = activeLog();
  log.request = request || currentRequestMeta();
  lastRequest = log.request;
}

function setActiveJson(data) {
  const log = activeLog();
  log.json = data || {};
  lastJson = log.json;
}

function syncActiveLogFromLegacy() {
  const log = activeLog();
  log.json = lastJson || {};
  log.request = lastRequest || log.request;
}

function renderActiveLog() {
  const log = activeLog();
  $("rawResult").classList.toggle("log-open", log.open);
  $("rawResult").textContent = JSON.stringify(log.json || {}, null, 2);
}

function toggleActiveLog() {
  const log = activeLog();
  log.open = !log.open;
  renderActiveLog();
  updateResultActions();
}

function startTimer() {
  startedAt = Date.now();
  updateTimer();
  window.clearInterval(timerInterval);
  timerInterval = window.setInterval(updateTimer, 1000);
}

function stopTimer() {
  window.clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");
  $("timer").textContent = `${minutes}:${seconds}`;
}

function toast(message) {
  if (!message) return;
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  window.clearTimeout(toast._timer);
  toast._timer = window.setTimeout(() => $("toast").classList.add("hidden"), 2600);
}

function successMessage(method, endpoint, data) {
  if (endpoint === "/images/generations" || endpoint === "/images/edits") return "图片已生成";
  if (endpoint === (providerConfig().chatEndpoint || "/chat/completions")) return "回复已返回";
  if (isVideoCreateEndpoint(endpoint)) return data?.task_id || data?.request_id || data?.id ? "视频任务已创建" : "请求已完成";
  if (endpoint.startsWith("/videos/")) {
    const status = data?.status ? `任务状态：${data.status}` : "任务状态已更新";
    return videoResultUrl(data) ? "视频已完成" : status;
  }
  return method === "GET" ? "查询完成" : "请求完成";
}

function shortenUrl(url) {
  if (url.startsWith("data:image/")) return `data:image/...${url.slice(-16)}`;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.length > 34 ? `${parsed.pathname.slice(0, 18)}...${parsed.pathname.slice(-12)}` : parsed.pathname;
    const query = parsed.search ? "..." : "";
    return `${parsed.host}${path}${query}`;
  } catch {
    return url.length > 56 ? `${url.slice(0, 28)}...${url.slice(-18)}` : url;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}






