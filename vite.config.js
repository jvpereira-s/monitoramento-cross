import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Caminhos relativos nos assets gerados — o app funciona tanto publicado na raiz do
  // domínio quanto numa subpasta (ex: dominio.com/monitoramento/), sem precisar saber
  // qual dos dois será o caso no HostGator antes do build.
  base: './',
  test: {
    // `node` por padrão: a maior parte do que está sob teste é src/lib/, lógica pura sem
    // DOM. Os poucos testes de componente pedem jsdom com o comentário
    // `// @vitest-environment jsdom` no topo do próprio arquivo.
    environment: 'node',
    // As decisões puras do sync (Edge Function) também: discovery.ts não depende de Deno.
    include: ['src/**/*.test.{js,jsx}', 'supabase/functions/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Só os módulos de lógica de negócio pura. db/auth/users/printwayySync são camada de
      // I/O (Supabase, API do PrintWayy) — cobrir isso exige teste de integração com banco
      // real, não unitário; deixá-los aqui só diluiria o número sem medir nada.
      include: [
        'src/lib/report.js', 'src/lib/printerStats.js', 'src/lib/importPrinters.js', 'src/lib/mapping.js',
        // Único componente na conta: é a rede de segurança da interface inteira, então
        // vale medir. O resto de src/components/ é layout, coberto por inspeção visual.
        'src/components/ErrorBoundary.jsx',
      ],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
})
