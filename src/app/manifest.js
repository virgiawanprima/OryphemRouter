export default function manifest() {
  return {
    name: 'OryphemRouter',
    short_name: 'OryphemRouter',
    description: 'One endpoint for all your AI providers. Manage keys, monitor usage, and scale effortlessly.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/images/logo-oryphem-putih.png',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  }
}
