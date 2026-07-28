// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

function Quebra() {
  throw new Error('falha simulada de render');
}

function Normal() {
  return <p>conteúdo normal</p>;
}

// O React sempre reporta o erro no console além de acionar o boundary — sem silenciar, a
// saída do teste vira um stack trace gigante que parece falha real.
let consoleErro;
beforeEach(() => {
  consoleErro = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleErro.mockRestore();
  cleanup();
});

describe('ErrorBoundary', () => {
  it('deixa a árvore passar quando nada quebra', () => {
    render(<ErrorBoundary><Normal /></ErrorBoundary>);
    expect(screen.getByText('conteúdo normal')).toBeTruthy();
    expect(screen.queryByText(/Algo deu errado/)).toBeNull();
  });

  it('mostra a tela de falha em vez de página em branco quando o filho quebra', () => {
    render(<ErrorBoundary><Quebra /></ErrorBoundary>);
    expect(screen.getByText(/Algo deu errado ao montar esta tela/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Recarregar página/ })).toBeTruthy();
  });

  it('mostra a mensagem técnica do erro para o suporte', () => {
    render(<ErrorBoundary><Quebra /></ErrorBoundary>);
    expect(screen.getByText('falha simulada de render')).toBeTruthy();
  });

  it('registra o erro no console, único canal de diagnóstico disponível', () => {
    render(<ErrorBoundary><Quebra /></ErrorBoundary>);
    const registrouComPrefixo = consoleErro.mock.calls.some(
      (args) => typeof args[0] === 'string' && args[0].includes('Erro não tratado na interface')
    );
    expect(registrouComPrefixo).toBe(true);
  });

  it('recarrega a página ao clicar no botão', () => {
    const reload = vi.fn();
    // window.location é read-only no jsdom; redefinir a propriedade é o jeito de espionar
    // o reload sem realmente recarregar o ambiente de teste.
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    });

    render(<ErrorBoundary><Quebra /></ErrorBoundary>);
    screen.getByRole('button', { name: /Recarregar página/ }).click();
    expect(reload).toHaveBeenCalledOnce();

    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });
});
