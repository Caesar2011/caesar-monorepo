import { type IcsProperty, type VComponent } from './types.js'

/**
 * Finds the first property with a given key from a component's properties.
 * @param component - The VComponent to search.
 * @param key - The property key (e.g., 'DTSTART').
 * @returns The IcsProperty or undefined if not found.
 */
export function findProperty(component: VComponent, key: string): IcsProperty | undefined {
  return component.properties.find((p) => p.key === key)
}

/**
 * Finds all properties with a given key from a component's properties.
 * @param component - The VComponent to search.
 * @param key - The property key (e.g., 'EXDATE').
 * @returns An array of matching IcsProperty objects.
 */
export function findProperties(component: VComponent, key: string): IcsProperty[] {
  return component.properties.filter((p) => p.key === key)
}
