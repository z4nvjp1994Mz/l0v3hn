# Da Loc 3D Interactive Masterplan

Git-backed Three.js demo for the Da Loc Industrial Cluster.

## Deployment flow

GitHub → Netlify → public site

Netlify settings:
- Branch: `main`
- Build command: leave empty
- Publish directory: `.`

This first Git-backed revision is self-contained and does not require a build step. Future updates can be pushed directly to this repository and Netlify can deploy them automatically.
