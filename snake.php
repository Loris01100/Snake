<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="testsnake.css" />
  <title>Snake — Vanilla JS</title>
</head>
<body>
  <div class="app">
    <div class="board-wrap">
      <div class="board" id="board" aria-label="Plateau du jeu Snake" role="application"></div>
      <div class="touch" aria-hidden="true">
        <button class="btn-up" data-dir="up">▲</button>
        <button class="btn-left" data-dir="left">◀</button>
        <button class="btn-right" data-dir="right">▶</button>
        <button class="btn-down" data-dir="down">▼</button>
      </div>
    </div>

    <aside class="panel">
      <div class="h"><span class="title">🐍 Snake</span> <span class="legend">Flèches / WASD</span></div>
      <div class="h"><div>Score</div><div class="stat" id="score">0</div></div>
      <div class="h"><div>Meilleur</div><div class="stat" id="best">0</div></div>
      <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.12); margin: 10px 0;" />

      <div class="controls">
        <div class="row">
          <button id="playBtn">▶️ Jouer</button>
          <button id="pauseBtn">⏸️ Pause</button>
        </div>
        <div class="row">
          <label style="display:flex; gap:8px; align-items:center;">
            Taille
            <select id="size">
              <option value="15">15×15</option>
              <option value="19">19×19</option>
              <option value="21" selected>21×21</option>
              <option value="25">25×25</option>
            </select>
          </label>
          <label style="display:flex; gap:8px; align-items:center;">
            Vitesse
            <select id="speed">
              <option value="130">Lent</option>
              <option value="100" selected>Normal</option>
              <option value="80">Rapide</option>
              <option value="60">Fou</option>
            </select>
          </label>
        </div>
        <button id="resetBtn">🔁 Réinitialiser</button>
        <p class="legend">P pour Pause • R pour Reset • Murs actifs • Pas de marche arrière immédiate</p>
      </div>
    </aside>
  </div>
  <script src="testsnake.js"></script>
</body>
</html>
