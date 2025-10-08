import { describe, expect, test } from 'vitest'
import plugin from '../../packages/@tailwindcss-bun/src/index'

describe('@tailwindcss/bun plugin', () => {
  test('plugin exports correct structure', () => {
    expect(plugin).toBeDefined()
    expect(plugin.name).toBe('@tailwindcss/bun')
    expect(typeof plugin.setup).toBe('function')
  })

  test('plugin setup registers correct hooks', () => {
    let registeredHooks: string[] = []

    const mockBuild = {
      onBeforeParse: (filter: any, handler: any) => {
        registeredHooks.push('onBeforeParse')
        expect(filter).toHaveProperty('filter')
        expect(handler).toHaveProperty('napiModule')
        expect(handler).toHaveProperty('symbol')
        expect(handler.symbol).toBe('tw_on_before_parse')
      },
      onLoad: (filter: any, handler: any) => {
        registeredHooks.push('onLoad')
        expect(filter).toHaveProperty('filter')
        expect(filter.filter).toBeInstanceOf(RegExp)
        expect(filter.filter.test('.css')).toBe(true)
        expect(typeof handler).toBe('function')
      }
    }

    plugin.setup(mockBuild as any)

    expect(registeredHooks).toContain('onBeforeParse')
    expect(registeredHooks).toContain('onLoad')
  })

  test('CSS file filter works correctly', () => {
    const mockBuild = {
      onBeforeParse: () => {},
      onLoad: (filter: any, handler: any) => {
        const regex = filter.filter

        // Should match CSS files
        expect(regex.test('styles.css')).toBe(true)
        expect(regex.test('app.css')).toBe(true)
        expect(regex.test('src/index.css')).toBe(true)

        // Should not match other files
        expect(regex.test('index.js')).toBe(false)
        expect(regex.test('app.ts')).toBe(false)
        expect(regex.test('README.md')).toBe(false)
      }
    }

    plugin.setup(mockBuild as any)
  })

  test('non-CSS file filter works correctly', () => {
    let nonCssFilter: RegExp | undefined

    const mockBuild = {
      onBeforeParse: (filter: any) => {
        nonCssFilter = filter.filter
      },
      onLoad: () => {}
    }

    plugin.setup(mockBuild as any)

    expect(nonCssFilter).toBeDefined()
    if (nonCssFilter) {
      // The regex matches almost everything for scanning
      // This is intentional - the native plugin scans all files for Tailwind classes

      // Should match non-CSS files
      expect(nonCssFilter.test('index.js')).toBe(true)
      expect(nonCssFilter.test('app.tsx')).toBe(true)
      expect(nonCssFilter.test('component.vue')).toBe(true)

      // Also matches CSS files (they get scanned too)
      expect(nonCssFilter.test('styles.css')).toBe(true)

      // Should match CSS with special queries
      expect(nonCssFilter.test('styles.css?raw')).toBe(true)
      expect(nonCssFilter.test('styles.css?url')).toBe(true)

      // Should match .bun directory files
      expect(nonCssFilter.test('/.bun/something')).toBe(true)

      // Also matches framework CSS modules (everything gets scanned)
      expect(nonCssFilter.test('component.vue?vue&type=style&index=0&lang.css')).toBe(true)
      expect(nonCssFilter.test('page.astro?astro&type=style&index=0&lang.css')).toBe(true)
      expect(nonCssFilter.test('app.svelte?svelte&type=style&lang.css')).toBe(true)
    }
  })
})