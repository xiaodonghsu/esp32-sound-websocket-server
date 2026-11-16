const API_BASE = "./api";

const state = { clients: [], selectedId: null };

const elements = {
  apiState: document.querySelector("#apiState"),
  deviceList: document.querySelector("#deviceList"),
  deviceCount: document.querySelector("#deviceCount"),
  searchInput: document.querySelector("#searchInput"),
  refreshButton: document.querySelector("#refreshButton"),
  emptySelection: document.querySelector("#emptySelection"),
  deviceWorkspace: document.querySelector("#deviceWorkspace"),
  selectedName: document.querySelector("#selectedName"),
  selectedId: document.querySelector("#selectedId"),
  selectedLocation: document.querySelector("#selectedLocation"),
  selectedType: document.querySelector("#selectedType"),
  selectedStatus: document.querySelector("#selectedStatus"),
  deleteButton: document.querySelector("#deleteButton"),
  controlForm: document.querySelector("#controlForm"),
  startParameters: document.querySelector("#startParameters"),
  setParametersField: document.querySelector("#setParametersField"),
  sendButton: document.querySelector("#sendButton"),
  responseOutput: document.querySelector("#responseOutput"),
  addDialog: document.querySelector("#addDialog"),
  addForm: document.querySelector("#addForm"),
  addFormError: document.querySelector("#addFormError"),
  toastRegion: document.querySelector("#toastRegion"),
};

function escapeHtml(value) {
  const span = document.createElement("span");
  span.textContent = String(value ?? "");
  return span.innerHTML;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!response.ok) {
    const detail = data?.detail;
    const message = Array.isArray(detail) ? detail.map((item) => item.msg).join("；") : detail || data?.message || `请求失败（${response.status}）`;
    throw new Error(message);
  }
  return data;
}

function setApiState(mode, label) {
  elements.apiState.className = `api-state ${mode}`;
  elements.apiState.querySelector("strong").textContent = label;
}

function toast(message, isError = false) {
  const item = document.createElement("div");
  item.className = `toast${isError ? " error" : ""}`;
  item.textContent = message;
  elements.toastRegion.append(item);
  window.setTimeout(() => item.remove(), 3200);
}

function filteredClients() {
  const query = elements.searchInput.value.trim().toLowerCase();
  if (!query) return state.clients;
  return state.clients.filter((client) => [client.id, client.name, client.location, client.type].some((value) => String(value ?? "").toLowerCase().includes(query)));
}

function renderClients() {
  const clients = filteredClients();
  elements.deviceCount.textContent = `${clients.length} / ${state.clients.length} 台设备`;
  if (!clients.length) {
    elements.deviceList.innerHTML = `<div class="empty-list">${state.clients.length ? "没有匹配的设备" : "还没有配置设备"}</div>`;
    return;
  }
  elements.deviceList.innerHTML = clients.map((client) => `
    <button class="device-item${client.id === state.selectedId ? " selected" : ""}" type="button" data-device-id="${escapeHtml(client.id)}">
      <strong>${escapeHtml(client.name)}</strong>
      <span class="chevron">›</span>
      <span class="mono">${escapeHtml(client.id)}</span>
      <span class="location">${escapeHtml(client.location || "未设置位置")}</span>
    </button>`).join("");
}

async function loadClients(preserveSelection = true) {
  elements.refreshButton.classList.add("loading");
  try {
    const data = await request("/configure/client");
    state.clients = Array.isArray(data?.clients) ? data.clients : [];
    if (!preserveSelection || !state.clients.some((client) => client.id === state.selectedId)) clearSelection();
    renderClients();
    setApiState("online", "服务已连接");
  } catch (error) {
    setApiState("offline", "服务不可用");
    elements.deviceList.innerHTML = `<div class="empty-list">无法加载设备<br><span class="mono">${escapeHtml(error.message)}</span></div>`;
    toast(error.message, true);
  } finally {
    elements.refreshButton.classList.remove("loading");
  }
}

function clearSelection() {
  state.selectedId = null;
  elements.emptySelection.hidden = false;
  elements.deviceWorkspace.hidden = true;
}

async function selectClient(id) {
  const fallback = state.clients.find((client) => client.id === id);
  if (!fallback) return;
  state.selectedId = id;
  renderClients();
  showSelected(fallback, null);
  try {
    const detail = await request(`/configure/client?id=${encodeURIComponent(id)}`);
    const client = detail?.clients?.[0] || detail?.client || detail?.config || detail;
    showSelected({ ...fallback, ...client }, detail);
  } catch (error) {
    elements.selectedStatus.innerHTML = `<span class="status-dot offline"></span>状态查询失败`;
    toast(error.message, true);
  }
}

function showSelected(client, detail) {
  elements.emptySelection.hidden = true;
  elements.deviceWorkspace.hidden = false;
  elements.selectedName.textContent = client.name || "未命名设备";
  elements.selectedId.textContent = client.id;
  elements.selectedLocation.textContent = client.location || "未设置";
  elements.selectedType.textContent = client.type || "未设置";
  const connected = detail?.connected ?? detail?.online ?? detail?.is_connected ?? client.connected ?? client.online;
  if (connected === true) elements.selectedStatus.innerHTML = `<span class="status-dot online"></span>在线`;
  else if (connected === false) elements.selectedStatus.innerHTML = `<span class="status-dot offline"></span>离线`;
  else elements.selectedStatus.innerHTML = `<span class="status-dot"></span>状态未知`;
}

elements.deviceList.addEventListener("click", (event) => {
  const item = event.target.closest("[data-device-id]");
  if (item) selectClient(item.dataset.deviceId);
});
elements.searchInput.addEventListener("input", renderClients);
elements.refreshButton.addEventListener("click", () => loadClients());

document.querySelector("#openAddButton").addEventListener("click", () => {
  elements.addForm.reset();
  elements.addFormError.textContent = "";
  elements.addDialog.showModal();
});
document.querySelector("#closeAddButton").addEventListener("click", () => elements.addDialog.close());
elements.addDialog.addEventListener("click", (event) => {
  if (event.target === elements.addDialog) elements.addDialog.close();
});
elements.addForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!elements.addForm.reportValidity()) return;
  const button = elements.addForm.querySelector("button[type=submit]");
  const values = Object.fromEntries(new FormData(elements.addForm));
  const payload = { id: values.id.trim(), name: values.name.trim(), location: values.location.trim() || null, type: values.type.trim() || null };
  button.disabled = true;
  elements.addFormError.textContent = "";
  try {
    await request("/configure/client", { method: "POST", body: JSON.stringify(payload) });
    elements.addDialog.close();
    await loadClients(false);
    await selectClient(payload.id);
    toast("设备已保存");
  } catch (error) {
    elements.addFormError.textContent = error.message;
  } finally { button.disabled = false; }
});

elements.deleteButton.addEventListener("click", async () => {
  const client = state.clients.find((item) => item.id === state.selectedId);
  if (!client || !window.confirm(`确定删除设备“${client.name}”吗？此操作不会删除录音文件。`)) return;
  elements.deleteButton.disabled = true;
  try {
    await request("/configure/client", { method: "DELETE", body: JSON.stringify({ id: client.id }) });
    clearSelection();
    await loadClients(false);
    toast("设备已删除");
  } catch (error) { toast(error.message, true); }
  finally { elements.deleteButton.disabled = false; }
});

elements.controlForm.addEventListener("change", (event) => {
  if (event.target.name !== "command") return;
  const command = event.target.value;
  elements.startParameters.hidden = command !== "start";
  elements.setParametersField.hidden = command !== "set";
});

elements.controlForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.selectedId) return;
  const values = Object.fromEntries(new FormData(elements.controlForm));
  const payload = { id: state.selectedId, cmd: values.command };
  if (values.command === "start") {
    let url;
    try { url = new URL(values.recorderUrl); }
    catch { toast("请输入有效的 WebSocket 上传地址", true); return; }
    if (!['ws:', 'wss:'].includes(url.protocol)) { toast("录音上传地址必须使用 ws:// 或 wss://", true); return; }
    url.searchParams.set("id", state.selectedId);
    url.searchParams.set("segment", values.segment);
    url.searchParams.set("samplerate", values.samplerate);
    url.searchParams.set("bitrate", values.bitrate);
    url.searchParams.set("channel", values.channel);
    payload.url = url.toString();
  } else if (values.command === "set") {
    try {
      payload.parameters = JSON.parse(values.parameters);
      if (!Array.isArray(payload.parameters) || payload.parameters.length === 0 || payload.parameters.some((item) => !item || typeof item.para !== "string" || !("value" in item))) {
        throw new Error("参数列表必须是包含 para 和 value 的非空 JSON 数组");
      }
    } catch (error) {
      toast(error.message || "参数 JSON 格式不正确", true);
      return;
    }
  }
  elements.sendButton.disabled = true;
  elements.responseOutput.textContent = "正在等待设备响应…";
  try {
    const response = await request("/client/control", { method: "POST", body: JSON.stringify(payload) });
    elements.responseOutput.textContent = typeof response === "string" ? response : JSON.stringify(response, null, 2);
    toast("控制消息已发送");
  } catch (error) {
    elements.responseOutput.textContent = `ERROR: ${error.message}`;
    toast(error.message, true);
  } finally { elements.sendButton.disabled = false; }
});

elements.controlForm.elements.recorderUrl.value = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:12345/v1/recorder`;
loadClients(false);
