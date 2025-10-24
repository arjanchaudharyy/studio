import type { InputPort, PortType } from '@/schemas/component'

export const normalizePortTypes = (type: PortType | PortType[]): PortType[] =>
  Array.isArray(type) ? type : [type]

export const inputSupportsType = (input: InputPort, type: PortType): boolean =>
  normalizePortTypes(input.type).includes(type)
