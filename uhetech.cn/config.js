// ===================================================================
//                        APPLICATION CONFIG
// ===================================================================
// This is the ONLY file you need to edit to switch between
// local development and the live production server.
// -------------------------------------------------------------------

// Set to `true` when you are deploying to http://uhetech.cn/
// Set to `false` when you are testing on your local computer.
const online_mode = false;

// --- ADVANCED SETTINGS (Edit only if necessary) ---

// Your local development port (e.g., from VS Code Live Server)
// This is usually 5500, 5501, or 8080. Check your browser's address bar.
const local_dev_port = 5488; // I've updated this to your port

// Your local CMS server port.
// cms-server.js defaults to 4000 unless you override CMS_PORT.
const local_cms_port = 4000;

// Your local AI backend port.
// server.js defaults to 3000 unless you override PORT.
const local_ai_port = 3000;

// ===================================================================
// --- DO NOT EDIT BELOW THIS LINE ---
// ===================================================================

const appConfig = {
    // Frontend settings
    API_ENDPOINT: online_mode 
        ? '/api/chat' // Production: Relative path to the same domain
        : `http://localhost:${local_ai_port}/api/chat`, // Development: Full path to local server

    // CMS / content-api settings
    // Production stays same-origin; local development points to cms-server.js.
    CONTENT_API_BASE: online_mode
        ? ''
        : `http://localhost:${local_cms_port}`,

    // Backend settings
    ALLOWED_ORIGINS: online_mode
        ? ['https://uhetech.cn'] // Production: Only allow the live domain
        : [
            'https://uhetech.cn',
            `http://localhost:${local_dev_port}`,
            `http://127.0.0.1:${local_dev_port}`,
            `http://localhost:${local_cms_port}`,
            `http://127.0.0.1:${local_cms_port}`,
        ] // Development: Allow live domain + local frontend + local CMS host
};

// This part makes the config available to both the browser (window) and Node.js (module.exports)
// This logic has been corrected to be reliable in all environments.
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    // We are in Node.js
    module.exports = appConfig;
} else {
    // We are in the browser
    window.appConfig = appConfig;
}
