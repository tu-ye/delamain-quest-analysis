const MAP_ORIGIN_X = 0;
const MAP_ORIGIN_Y = 0;
const MAP_WIDTH = 8227;
const MAP_HEIGHT = 4982;

const views = {
  overview: { title: "全局总览", x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT },
  stage1: { title: "Stage 1 · 车库事故", x: 1, y: 1925, width: 520, height: 1115 },
  stage2: { title: "Stage 2 · 总部理赔", x: 921, y: 1925, width: 520, height: 1115 },
  stage3: { title: "Stage 3 · 接受委托", x: 1711, y: 1925, width: 520, height: 1115 },
  stage4: { title: "Stage 4 · 寻找失联车辆", x: 2461, y: 2044, width: 520, height: 876 },
  stage4a: { title: "Stage 4a · 北橡区", x: 3336, y: 1, width: 520, height: 640 },
  stage4b: { title: "Stage 4b · 谷地区", x: 3336, y: 721, width: 520, height: 640 },
  stage4c: { title: "Stage 4c · 美泉区", x: 3336, y: 1441, width: 520, height: 640 },
  stage4d: { title: "Stage 4d · 海景区", x: 3336, y: 2161, width: 520, height: 640 },
  stage4e: { title: "Stage 4e · 科罗纳多", x: 3336, y: 2901, width: 520, height: 640 },
  stage4f: { title: "Stage 4f · 恶土", x: 3336, y: 3625, width: 520, height: 640 },
  stage4g: { title: "Stage 4g · 北区", x: 3336, y: 4341, width: 520, height: 640 },
  stage5: { title: "Stage 5 · 返回总部", x: 4175, y: 2044, width: 520, height: 876 },
  stage6: { title: "Stage 6 · 寻找入口", x: 5401, y: 1925, width: 520, height: 1115 },
  stage7: { title: "Stage 7 · 解除门禁", x: 6166, y: 1925, width: 520, height: 1115 },
  stage8: { title: "Stage 8 · 维修车间", x: 6941, y: 1925, width: 520, height: 1115 },
  stage9: { title: "Stage 9 · 最终选择", x: 7706, y: 1925, width: 520, height: 1115 }
};

const viewport = document.querySelector("#viewport");
const canvas = document.querySelector("#canvas");
const mapSvg = document.querySelector("#map-svg");
const zoomReadout = document.querySelector("#zoom-readout");
const viewTitle = document.querySelector("#view-title");
const loadingPanel = document.querySelector("#loading-panel");
const canvasHint = document.querySelector("#canvas-hint");
const minimap = document.querySelector("#minimap");
const minimapWindow = document.querySelector("#minimap-window");
const sidebar = document.querySelector("#sidebar");
const sidebarScrim = document.querySelector("#sidebar-scrim");

let scale = 0.12;
let x = 0;
let y = 0;
let loaded = false;
let activeView = "overview";
let hintTimer;
let animationFrame;
const pointers = new Map();
let dragStart = null;
let pinchStart = null;

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function render() {
  const svg = mapSvg.querySelector("svg");
  if (svg && viewport.clientWidth && viewport.clientHeight) {
    const viewX = -x / scale;
    const viewY = -y / scale;
    const viewWidth = viewport.clientWidth / scale;
    const viewHeight = viewport.clientHeight / scale;
    svg.setAttribute("viewBox", `${MAP_ORIGIN_X + viewX} ${MAP_ORIGIN_Y + viewY} ${viewWidth} ${viewHeight}`);
  }
  zoomReadout.textContent = `${Math.round(scale * 100)}%`;
  updateMinimap();
}

function animateTo(target, duration = 380) {
  cancelAnimationFrame(animationFrame);
  const from = { x, y, scale };
  const start = performance.now();
  const tick = now => {
    const t = clamp((now - start) / duration, 0, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    x = from.x + (target.x - from.x) * ease;
    y = from.y + (target.y - from.y) * ease;
    scale = from.scale + (target.scale - from.scale) * ease;
    render();
    if (t < 1) animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);
}

function getFitTransform(rect, padding = 42) {
  const width = Math.max(1, viewport.clientWidth - padding * 2);
  const height = Math.max(1, viewport.clientHeight - padding * 2);
  const nextScale = clamp(Math.min(width / rect.width, height / rect.height), 0.045, 2.4);
  return {
    scale: nextScale,
    x: (viewport.clientWidth - rect.width * nextScale) / 2 - rect.x * nextScale,
    y: (viewport.clientHeight - rect.height * nextScale) / 2 - rect.y * nextScale
  };
}

function focusView(key, animate = true) {
  const rect = views[key] || views.overview;
  activeView = key in views ? key : "overview";
  const target = getFitTransform(rect, activeView === "overview" ? 32 : 46);
  viewTitle.textContent = rect.title;
  document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("is-active", button.dataset.view === activeView));
  if (animate) animateTo(target); else { ({ x, y, scale } = target); render(); }
  closeSidebar();
}

function zoomAt(factor, clientX, clientY) {
  const bounds = viewport.getBoundingClientRect();
  const px = clientX - bounds.left;
  const py = clientY - bounds.top;
  const nextScale = clamp(scale * factor, 0.045, 3.2);
  const worldX = (px - x) / scale;
  const worldY = (py - y) / scale;
  x = px - worldX * nextScale;
  y = py - worldY * nextScale;
  scale = nextScale;
  activeView = "custom";
  viewTitle.textContent = "自由浏览";
  document.querySelectorAll("[data-view]").forEach(button => button.classList.remove("is-active"));
  render();
}

function updateMinimap() {
  if (!viewport.clientWidth) return;
  const inset = 7;
  const w = Math.max(1, minimap.clientWidth - inset * 2);
  const h = Math.max(1, minimap.clientHeight - inset * 2);
  const worldLeft = -x / scale;
  const worldTop = -y / scale;
  const worldWidth = viewport.clientWidth / scale;
  const worldHeight = viewport.clientHeight / scale;
  minimapWindow.style.left = `${inset + clamp(worldLeft / MAP_WIDTH * w, 0, w)}px`;
  minimapWindow.style.top = `${inset + clamp(worldTop / MAP_HEIGHT * h, 0, h)}px`;
  minimapWindow.style.width = `${clamp(worldWidth / MAP_WIDTH * w, 5, w)}px`;
  minimapWindow.style.height = `${clamp(worldHeight / MAP_HEIGHT * h, 5, h)}px`;
}

function hideHintSoon() {
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => canvasHint.classList.add("is-hidden"), 1700);
}

function closeSidebar() {
  sidebar.classList.remove("is-open");
  sidebarScrim.classList.remove("is-visible");
}

async function loadMap() {
  try {
    const response = await fetch("assets/delamain-map.svg");
    if (!response.ok) throw new Error(`SVG request failed: ${response.status}`);

    const source = await response.text();
    const documentSvg = new DOMParser().parseFromString(source, "image/svg+xml");
    if (documentSvg.querySelector("parsererror")) throw new Error("SVG parse failed");

    const svg = documentSvg.documentElement;
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.setAttribute("viewBox", `${MAP_ORIGIN_X} ${MAP_ORIGIN_Y} ${MAP_WIDTH} ${MAP_HEIGHT}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.colorScheme = "light";
    svg.style.background = "#ffffff";

    svg.querySelectorAll("switch").forEach(switchNode => {
      const textLayer = [...switchNode.children].find(node => node.localName === "foreignObject");
      if (!textLayer) return;
      textLayer.removeAttribute("requiredFeatures");
      [...switchNode.children].forEach(node => {
        if (node !== textLayer) node.remove();
      });
    });

    mapSvg.replaceChildren(document.importNode(svg, true));
    loaded = true;
    loadingPanel.classList.add("is-hidden");
    focusView("overview", false);
    hideHintSoon();
  } catch (error) {
    console.error(error);
    loadingPanel.innerHTML = "<strong>画布载入失败，请刷新页面重试</strong>";
  }
}

document.querySelector("#stage-nav").addEventListener("click", event => {
  const button = event.target.closest("[data-view]");
  if (button) focusView(button.dataset.view);
});

document.querySelector("#zoom-in").addEventListener("click", () => zoomAt(1.25, viewport.getBoundingClientRect().left + viewport.clientWidth / 2, viewport.getBoundingClientRect().top + viewport.clientHeight / 2));
document.querySelector("#zoom-out").addEventListener("click", () => zoomAt(0.8, viewport.getBoundingClientRect().left + viewport.clientWidth / 2, viewport.getBoundingClientRect().top + viewport.clientHeight / 2));
document.querySelector("#fit-button").addEventListener("click", () => focusView("overview"));
document.querySelector("#fullscreen-button").addEventListener("click", async () => {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  else await document.exitFullscreen?.();
});

document.querySelector("#menu-button").addEventListener("click", () => {
  sidebar.classList.add("is-open");
  sidebarScrim.classList.add("is-visible");
});
sidebarScrim.addEventListener("click", closeSidebar);

viewport.addEventListener("wheel", event => {
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * 0.00125);
  zoomAt(factor, event.clientX, event.clientY);
}, { passive: false });

viewport.addEventListener("dblclick", event => {
  event.preventDefault();
  zoomAt(1.6, event.clientX, event.clientY);
});

viewport.addEventListener("pointerdown", event => {
  viewport.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 1) {
    dragStart = { px: event.clientX, py: event.clientY, x, y };
    viewport.classList.add("is-dragging");
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      centerX: (a.x + b.x) / 2,
      centerY: (a.y + b.y) / 2,
      scale
    };
  }
  canvasHint.classList.add("is-hidden");
});

viewport.addEventListener("pointermove", event => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 1 && dragStart) {
    x = dragStart.x + event.clientX - dragStart.px;
    y = dragStart.y + event.clientY - dragStart.py;
    activeView = "custom";
    viewTitle.textContent = "自由浏览";
    render();
  } else if (pointers.size === 2 && pinchStart) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const factor = distance / Math.max(1, pinchStart.distance);
    const rect = viewport.getBoundingClientRect();
    const cx = pinchStart.centerX - rect.left;
    const cy = pinchStart.centerY - rect.top;
    const nextScale = clamp(pinchStart.scale * factor, 0.045, 3.2);
    const worldX = (cx - x) / scale;
    const worldY = (cy - y) / scale;
    x = cx - worldX * nextScale;
    y = cy - worldY * nextScale;
    scale = nextScale;
    render();
  }
});

function endPointer(event) {
  pointers.delete(event.pointerId);
  if (pointers.size === 0) {
    dragStart = null;
    pinchStart = null;
    viewport.classList.remove("is-dragging");
  } else if (pointers.size === 1) {
    const [point] = [...pointers.values()];
    dragStart = { px: point.x, py: point.y, x, y };
    pinchStart = null;
  }
}
viewport.addEventListener("pointerup", endPointer);
viewport.addEventListener("pointercancel", endPointer);

minimap.addEventListener("pointerdown", event => {
  event.stopPropagation();
  const stage = event.target.closest(".mini-stage");
  if (stage) {
    focusView(stage.dataset.view);
    return;
  }
  const rect = minimap.getBoundingClientRect();
  const inset = 7;
  const innerWidth = Math.max(1, rect.width - inset * 2);
  const innerHeight = Math.max(1, rect.height - inset * 2);
  const worldX = clamp((event.clientX - rect.left - inset) / innerWidth, 0, 1) * MAP_WIDTH;
  const worldY = clamp((event.clientY - rect.top - inset) / innerHeight, 0, 1) * MAP_HEIGHT;
  x = viewport.clientWidth / 2 - worldX * scale;
  y = viewport.clientHeight / 2 - worldY * scale;
  activeView = "custom";
  viewTitle.textContent = "自由浏览";
  render();
});

window.addEventListener("keydown", event => {
  const centerX = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
  const centerY = viewport.getBoundingClientRect().top + viewport.clientHeight / 2;
  if (["+", "="].includes(event.key)) zoomAt(1.25, centerX, centerY);
  if (["-", "_"].includes(event.key)) zoomAt(0.8, centerX, centerY);
  if (event.key === "0" || event.key === "Home") focusView("overview");
  if (event.key.toLowerCase() === "f") document.querySelector("#fullscreen-button").click();
  if (event.key === "Escape") closeSidebar();
});

window.addEventListener("resize", () => {
  if (loaded && activeView in views) focusView(activeView, false);
  else render();
});

loadMap();
