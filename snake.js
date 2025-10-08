// testsnake.js — avec gestions d'erreurs

// Evite l'initialisation multiple si le script est chargé 2x
if (window.__SNAKE_LOADED__) {
  console.warn("Snake déjà initialisé: second chargement ignoré.");
  // Ne rien faire sur ce second chargement
} else {
  window.__SNAKE_LOADED__ = true;

(() => {
  "use strict";

  // ---- Petites aides erreurs / logs ----------------------------------------
  function showErrorOverlay(message, details) {
    try {
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.background = "rgba(0,0,0,0.7)";
      overlay.style.color = "#fff";
      overlay.style.zIndex = "9999";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.padding = "20px";
      overlay.innerHTML = `
        <div style="max-width:700px;background:#1a2336;border:1px solid rgba(255,255,255,.2);padding:16px 18px;border-radius:12px;font-family:system-ui,Arial,sans-serif;">
          <div style="font-weight:700;margin-bottom:8px;">Une erreur est survenue 😬</div>
          <div style="white-space:pre-wrap;word-break:break-word;margin-bottom:8px;">${message}</div>
          ${details ? `<pre style="max-height:240px;overflow:auto;background:#0f1830;padding:8px;border-radius:8px;">${details}</pre>` : ""}
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px;">
            <button id="err-close" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:#263458;color:#fff;cursor:pointer">Fermer</button>
            <button id="err-reload" style="padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:#2f7e5f;color:#fff;cursor:pointer">Recharger</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      overlay.querySelector("#err-close")?.addEventListener("click", () => overlay.remove());
      overlay.querySelector("#err-reload")?.addEventListener("click", () => location.reload());
    } catch (_) {
        
      alert("Erreur: " + message);
    }
  }

  function safeGetElement(selector) {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Élément introuvable pour le sélecteur: ${selector}`);
    return el;
  }

  function safeNumber(val, fallback) {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
  }

  // localStorage sécurisé (peut être désactivé par navigateur)
  const safeStorage = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch { return null; }
    },
    set(key, val) {
      try { window.localStorage.setItem(key, val); } catch { /* noop */ }
    }
  };

  // ---- Sélecteurs sûrs -----------------------------------------------------
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // On attend le DOM prêt si le script n'a pas defer
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  function init() {
    try {
      const board  = safeGetElement("#board");
      const scoreEl = safeGetElement("#score");
      const bestEl  = safeGetElement("#best");

      const sizeSel  = safeGetElement("#size");
      const speedSel = safeGetElement("#speed");

      const playBtn  = safeGetElement("#playBtn");
      const pauseBtn = safeGetElement("#pauseBtn");
      const resetBtn = safeGetElement("#resetBtn");

      const touchWrap = safeGetElement(".touch");

      // --- État du jeu ---
      const state = {
        size: 21,
        tickMs: 100,
        snake: [],
        dir: { x: 1, y: 0 },
        nextDir: { x: 1, y: 0 },
        food: { x: 10, y: 10 },
        walls: new Set(),
        score: 0,
        best: Number(safeStorage.get("snake_best") || 0) || 0,
        running: false,
        loopId: null,
        destroyed: false
      };

      function destroyLoop() {
        state.running = false;
        if (state.loopId) {
          clearInterval(state.loopId);
          state.loopId = null;
        }
      }

      function coordKey(x, y) { return `${x},${y}`; }

      function setupBoard(size) {
        if (!Number.isInteger(size) || size < 5 || size > 99) {
          throw new Error(`Taille de grille invalide: ${size} (attendu 5..99)`);
        }
        document.documentElement.style.setProperty("--grid-size", size);
        board.innerHTML = "";
        const frag = document.createDocumentFragment();
        for (let i = 0; i < size * size; i++) {
          const cell = document.createElement("div");
          cell.className = "cell";
          frag.appendChild(cell);
        }
        board.appendChild(frag);
      }

      function idxInBounds(x, y) {
        return x >= 0 && y >= 0 && x < state.size && y < state.size;
      }

      function cellAt(x, y) {
        if (!idxInBounds(x, y)) return null;
        const idx = (y * state.size) + x;
        return board.children[idx] || null;
      }

      function placeFood() {
        // Essaie aléatoire avec cap, sinon parcours déterministe
        let x, y, tries = 0;
        const snakeSet = new Set(state.snake.map(s => coordKey(s.x, s.y)));
        while (tries < 500) {
          x = randInt(0, state.size - 1);
          y = randInt(0, state.size - 1);
          if (!snakeSet.has(coordKey(x, y)) && !state.walls.has(coordKey(x, y))) {
            state.food = { x, y };
            return;
          }
          tries++;
        }
        // Fallback: cherche une case libre
        for (let iy = 0; iy < state.size; iy++) {
          for (let ix = 0; ix < state.size; ix++) {
            const k = coordKey(ix, iy);
            if (!snakeSet.has(k) && !state.walls.has(k)) {
              state.food = { x: ix, y: iy };
              return;
            }
          }
        }
        // Si on arrive ici, la grille est pleine: fin de partie
        gameOver("Plus d'emplacements libres pour la nourriture.");
      }

      function spawnWalls(ratio = 0) {
        ratio = Math.max(0, Math.min(0.5, Number(ratio) || 0)); // clamp
        state.walls.clear();
        const total = state.size * state.size;
        const target = Math.floor(total * ratio);
        let tries = 0;
        while (state.walls.size < target && tries < target * 10) {
          const x = randInt(0, state.size - 1);
          const y = randInt(0, state.size - 1);
          // éviter le centre initial
          if (Math.abs(x - Math.floor(state.size / 2)) + Math.abs(y - Math.floor(state.size / 2)) < 3) {
            tries++;
            continue;
          }
          state.walls.add(coordKey(x, y));
          tries++;
        }
      }

      function updateScore() {
        scoreEl.textContent = String(state.score);
        bestEl.textContent = String(state.best);
      }

      function draw() {
        try {
          // nettoyage rapide: supprime classes sur toutes les cases précédentes
          $$(".snake, .food, .wall", board).forEach(el => {
            el.classList.remove("snake", "head", "food", "wall");
          });

          // murs
          for (const key of state.walls) {
            const [x, y] = key.split(",").map(Number);
            const c = cellAt(x, y);
            if (c) c.classList.add("wall");
          }

          // serpent
          state.snake.forEach((seg, i) => {
            const c = cellAt(seg.x, seg.y);
            if (!c) return; // garde-fou
            c.classList.add("snake");
            if (i === state.snake.length - 1) c.classList.add("head");
          });

          // nourriture
          const f = cellAt(state.food.x, state.food.y);
          if (f) f.classList.add("food");
        } catch (err) {
          // Si dessiner échoue, on stoppe tout pour éviter le spam d'erreurs
          console.error("Erreur draw()", err);
          destroyLoop();
          showErrorOverlay("Erreur d'affichage (draw).", String(err?.stack || err));
        }
      }

      function setSpeed(ms) {
        state.tickMs = safeNumber(ms, 100);
        speedSel.value = String(state.tickMs);
        if (state.running) {
          clearInterval(state.loopId);
          state.loopId = setInterval(ticked, state.tickMs);
        }
      }

      function start() {
        if (state.running) return;
        state.running = true;
        state.loopId = setInterval(ticked, state.tickMs);
        resetGame({ keepBest: true });
      }

      function stop() {
        state.running = false;
        if (state.loopId) {
          clearInterval(state.loopId);
          state.loopId = null;
        }
      }

      function gameOver(reason = null) {
        stop();
        try {
          const head = state.snake[state.snake.length - 1];
          const c = head ? cellAt(head.x, head.y) : null;
          if (c) {
            c.animate(
              [
                { transform: "scale(1)", background: "linear-gradient(180deg,#2cf5a7,#0fbf77)" },
                { transform: "scale(0.9)", background: "linear-gradient(180deg,#ff9f9f,#ff6b6b)" },
                { transform: "scale(1)", background: "linear-gradient(180deg,#2cf5a7,#0fbf77)" }
              ],
              { duration: 500, iterations: 1 }
            );
          }
        } catch { /* safe */ }
        const msg = `💀 Perdu !\nScore : ${state.score}${reason ? `\n\n(${reason})` : ""}`;
        alert(msg);
      }

      function ticked() {
        try {
          step();
        } catch (err) {
          console.error("Erreur step()", err);
          destroyLoop();
          showErrorOverlay("Erreur dans la boucle de jeu (step). La partie est interrompue.", String(err?.stack || err));
        }
      }

      function step() {
        // appliquer la prochaine direction
        state.dir = state.nextDir;
        const head = state.snake[state.snake.length - 1];
        if (!head) {
          throw new Error("Serpent vide — état invalide.");
        }
        const nx = head.x + state.dir.x;
        const ny = head.y + state.dir.y;

        // collisions bords
        if (!idxInBounds(nx, ny)) return gameOver("Collision avec le bord.");

        // obstacles
        if (state.walls.has(coordKey(nx, ny))) return gameOver("Collision avec un mur.");

        // corps
        const bite = state.snake.some(seg => seg.x === nx && seg.y === ny);
        if (bite) return gameOver("Auto-collision.");

        // avance
        state.snake.push({ x: nx, y: ny });

        // nourriture ?
        if (nx === state.food.x && ny === state.food.y) {
          state.score = safeNumber(state.score, 0) + 10;
          if (state.score > state.best) {
            state.best = state.score;
            safeStorage.set("snake_best", String(state.best));
          }
          updateScore();
          placeFood();
          // légère accélération progressive
          if (state.tickMs > 55) setSpeed(state.tickMs - 2);
        } else {
          // retirer la queue
          state.snake.shift();
        }

        draw();
      }

      function canTurn(nx, ny) {
        const head = state.snake[state.snake.length - 1];
        const neck = state.snake[state.snake.length - 2];
        if (!neck) return true;
        const ox = head.x - neck.x;
        const oy = head.y - neck.y;
        // empêche demi-tour immédiat
        return !(nx === -ox && ny === -oy);
      }

      function resetGame({ keepBest = true } = {}) {
        try {
          // récupère valeurs UI avec fallback
          state.size  = safeNumber(sizeSel.value, 21);
          state.tickMs = safeNumber(speedSel.value, 100);

          setupBoard(state.size);
          spawnWalls(0.0); // mettre 0.05 pour plus de challenge

          const mid = Math.floor(state.size / 2);
          state.snake = [{ x: mid - 1, y: mid }, { x: mid, y: mid }, { x: mid + 1, y: mid }];
          state.dir = { x: 1, y: 0 };
          state.nextDir = { x: 1, y: 0 };
          state.score = 0;

          if (keepBest) {
            state.best = Number(safeStorage.get("snake_best") || 0) || 0;
          }
          updateScore();
          placeFood();
          draw();
        } catch (err) {
          console.error("Erreur resetGame()", err);
          showErrorOverlay("Impossible d'initialiser le jeu (resetGame).", String(err?.stack || err));
        }
      }

      // --- Entrées clavier ---
      const DIRS = {
        ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
        z: { x: 0, y: -1 }, s: { x: 0, y: 1 }, q: { x: -1, y: 0 }, d: { x: 1, y: 0 }
      };

      window.addEventListener("keydown", (e) => {
        try {
          if (e.key === "p" || e.key === "P") { state.running ? stop() : start(); return; }
          if (e.key === "r" || e.key === "R") { resetGame(); return; }
          const d = DIRS[e.key];
          if (!d) return;
          if (canTurn(d.x, d.y)) state.nextDir = d;
        } catch (err) {
          console.error("Erreur keydown", err);
        }
      });

      // Boutons UI
      playBtn.addEventListener("click",  () => { try { start(); } catch (e) { console.error(e); } });
      pauseBtn.addEventListener("click", () => { try { stop(); } catch (e) { console.error(e); } });
      resetBtn.addEventListener("click", () => { try { resetGame(); } catch (e) { console.error(e); } });
      sizeSel.addEventListener("change", () => { try { resetGame(); } catch (e) { console.error(e); } });
      speedSel.addEventListener("change", (e) => { try { setSpeed(parseInt(e.target.value, 10)); } catch (e2) { console.error(e2); } });

      // Commandes tactiles
      touchWrap.addEventListener("click", (e) => {
        try {
          if (!(e.target instanceof HTMLElement)) return;
          const dir = e.target.getAttribute("data-dir");
          if (!dir) return;
          const map = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
          const d = map[dir];
          if (d && canTurn(d.x, d.y)) state.nextDir = d;
        } catch (err) {
          console.error("Erreur commandes tactiles", err);
        }
      });

      // Gestes swipe
      let sx = 0, sy = 0;
      board.addEventListener("touchstart", (e) => {
        try {
          const t = e.changedTouches?.[0];
          if (!t) return;
          sx = t.clientX; sy = t.clientY;
        } catch (err) { console.error(err); }
      }, { passive: true });

      board.addEventListener("touchend", (e) => {
        try {
          const t = e.changedTouches?.[0];
          if (!t) return;
          const dx = t.clientX - sx;
          const dy = t.clientY - sy;
          if (Math.abs(dx) < 25 && Math.abs(dy) < 25) return;
          if (Math.abs(dx) > Math.abs(dy)) {
            const d = { x: Math.sign(dx), y: 0 }; if (canTurn(d.x, d.y)) state.nextDir = d;
          } else {
            const d = { x: 0, y: Math.sign(dy) }; if (canTurn(d.x, d.y)) state.nextDir = d;
          }
        } catch (err) {
          console.error("Erreur swipe", err);
        }
      }, { passive: true });

      // --- Init ---
      resetGame();

      // Expose quelques helpers pour debug (optionnel)
      window.__snake = {
        start, stop, resetGame, setSpeed, state
      };

    } catch (err) {
      console.error("Erreur d'initialisation globale", err);
      showErrorOverlay("Impossible d'initialiser Snake. Vérifie que l'HTML contient les bons IDs (#board, #score, #best...) et que testsnake.js est bien chargé.", String(err?.stack || err));
    }
  }
})();
}
