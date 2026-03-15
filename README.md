# 🎨 Muscle Picasso 3D

Paint directly on a 3D anatomical model to select muscle groups, then generate a targeted workout plan.

![Muscle Picasso](https://img.shields.io/badge/React-18-blue) ![Three.js](https://img.shields.io/badge/Three.js-r170-green) ![Vite](https://img.shields.io/badge/Vite-5-purple)

---

## Prerequisites

You need **Node.js** installed (version 18 or newer).

- **Mac**: `brew install node`
- **Windows**: Download from https://nodejs.org (use the LTS version)
- **Check if installed**: Open a terminal and run `node --version`

---

## Quick Start

### 1. Open the project in VS Code

Open VS Code, then go to **File → Open Folder** and select this `muscle-painter-project` folder.

### 2. Add your 3D model

Copy your `male_base_muscular_anatomy.glb` file into the `public/` folder:

```
muscle-painter-project/
├── public/
│   └── male_base_muscular_anatomy.glb   ← PUT IT HERE
├── src/
├── package.json
└── ...
```

### 3. Open the terminal in VS Code

Press `` Ctrl+` `` (backtick) to open the integrated terminal.

### 4. Install dependencies

```bash
npm install
```

This will download React, Three.js, and all other libraries. It may take a minute.

### 5. Start the dev server

```bash
npm run dev
```

You should see output like:

```
  VITE v5.x.x  ready in 500ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: http://192.168.x.x:3000/
```

### 6. Open in your browser

Your browser should open automatically. If not, go to **http://localhost:3000**

---

## How to Use

| Action | Control |
|---|---|
| **Paint muscles** | Left-click + drag on the model |
| **Orbit / rotate** | Right-click + drag, or Ctrl + left-drag |
| **Zoom** | Scroll wheel |
| **Erase paint** | Switch to Erase mode in sidebar |

### Workflow

1. Select a **muscle group color** from the sidebar (e.g., Chest = red, Back = purple)
2. **Paint** that color onto the 3D model where the muscle is
3. The app **auto-detects** which muscles you've painted
4. Click **"Generate Workout"** to see a tailored exercise plan
5. Use **"Clear All Paint"** to start over

---

## Project Structure

```
muscle-painter-project/
├── public/
│   └── male_base_muscular_anatomy.glb  ← Your 3D model
├── src/
│   ├── main.jsx            ← Entry point
│   ├── App.jsx             ← Main app layout + state
│   ├── Viewport3D.jsx      ← Three.js scene (model + painting + orbit)
│   ├── PaintEngine.js      ← 2048×2048 paint canvas + muscle detection
│   ├── paintShader.js      ← Custom GLSL shader (base texture + paint overlay)
│   ├── WorkoutPanel.jsx    ← Exercise recommendation UI
│   └── exercises.js        ← Exercise database + muscle colors
├── index.html
├── package.json
└── vite.config.js
```

### How the painting works

1. **Raycasting** — When you click/drag on the model, a ray is cast from the camera through the mouse position. Three.js finds where it intersects the mesh and returns the **UV coordinates** of that point.

2. **Paint Canvas** — A hidden 2048×2048 `<canvas>` element is used as the paint surface. Brush strokes are drawn at the UV coordinates with a soft radial gradient.

3. **Shader Blending** — A custom GLSL shader reads both the **original model texture** and the **paint canvas texture**, blending them together. Painted areas get a subtle glow effect.

4. **Muscle Detection** — When you stop painting, the app scans the paint canvas pixels, matches each painted color to the closest muscle group, and updates the "Detected" list.

---

## Customization

### Change muscle colors

Each muscle group's `color` property in `exercises.js` is a hex color. Change it and both the paint color and UI will update.

### Use a different 3D model

Replace the GLB in `public/` and update the path in `src/Viewport3D.jsx` (the `modelPath` prop). The app works best with models that have:
- UV-mapped textures (so painting maps correctly)
- A single body mesh (the app targets the mesh with the most vertices)

---

## Building for Production

```bash
npm run build
```

This creates a `dist/` folder you can deploy to any static host (Netlify, Vercel, GitHub Pages, etc.)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm install` fails | Make sure Node.js 18+ is installed: `node --version` |
| Model doesn't load | Check that the `.glb` file is in `public/` and the filename matches exactly |
| Painting doesn't work | Make sure you're left-clicking (right-click is orbit). Try a bigger brush size. |
| Black model / no texture | The model needs a base color texture. Check the console for errors. |
| Slow performance | Reduce browser zoom to 100%. Close other GPU-heavy tabs. |
