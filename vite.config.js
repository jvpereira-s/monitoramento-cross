import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Caminhos relativos nos assets gerados — o app funciona tanto publicado na raiz do
  // domínio quanto numa subpasta (ex: dominio.com/monitoramento/), sem precisar saber
  // qual dos dois será o caso no HostGator antes do build.
  base: './',
})
