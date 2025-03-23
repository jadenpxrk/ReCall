# ReCall

A Chrome extension that builds a dynamic knowledge graph from your browsing history.

## Description

ReCall analyzes your browsing history to create an interconnected knowledge graph, helping you visualize and recall your online research journey. It enhances your browsing experience by providing context and connections between visited web pages.

## Installation

### Prerequisites
- Node.js (16.x or higher)
- pnpm (recommended) or npm

### Setup and Build

1. Clone this repository:
   ```bash
   git clone [repository-url]
   cd ReCall
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```
   
3. Build the extension:
   ```bash
   pnpm build
   ```

4. Load the extension in Chrome:
   - Open Chrome browser
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in the top-right corner)
   - Click "Load unpacked"
   - Select the `build/chrome-mv3-prod` directory from this project

## Troubleshooting

### vfile Dependency Error
If you encounter an error related to vfile and #minpath during build:

```bash
npm pkg set resolutions.vfile="^5.0.0"
pnpm install
pnpm build
```

### Sharp Library Error
If you encounter issues with the Sharp image processing library:

```bash
pnpm install --include=optional sharp
```

### General Dependency Issues
Clear cache and reinstall:
```bash
pnpm store prune
pnpm install --force
```

## Usage

After installation, ReCall will:
- Override your Chrome new tab page with its interface
- Collect and analyze your browsing history
- Generate visual knowledge graphs of your online research
- Allow you to search and explore connections between web pages

## Development

For development mode:
```bash
pnpm dev
```

## License

MIT
