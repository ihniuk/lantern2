import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
            manifest: {
                name: 'Lantern Network Scanner',
                short_name: 'Lantern',
                description: 'Network device scanner and speed test monitor',
                theme_color: '#ffffff',
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            },
            workbox: {
                // We need to handle push events in a custom SW or ensure workbox allows it.
                // For simplicity, we can use the default generateSW but we need to append custom logic for push?
                // Actually, 'injectManifest' is better for custom push handling. 
                // Let's stick to generateSW for caching first, but we might need a separate push-worker. 
                // Wait, to handle "push" event, we MUST have code in the SW. 
                // If we use generateSW, we can't easily add the push listener.
                // Let's switch to src/sw.ts strategy later if needed, but for now let's try to import a custom sw logic
                // or just use injectManifest. 
                // Let's go with injectManifest to be safe for Push.
            },
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts'
        })
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        host: true,
        port: 5173,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true,
                secure: false,
            }
        }
    }
})
