import { describe, expect, it } from 'vitest'
import { prepareCommand } from '../../src/shared/serial/CommandPreparation'

describe('prepareCommand', () => {
  it('applies the same text-mode newline rule used by the command box', async () => {
    const result = await prepareCommand('echo TEST', { autoNewline: true, hexMode: false })

    expect(result.data).toBe('echo TEST\r\n')
    expect(result.displayCommand).toBe('echo TEST')
    expect(result.hexMode).toBe(false)
  })

  it('applies HEX mode newline and checksum through the software callback', async () => {
    const result = await prepareCommand(
      '01 02',
      { autoNewline: true, hexMode: true, crcEnabled: true, crcMethod: 'TEST-CRC' },
      async (hexData, method) => {
        expect(hexData).toBe('01020D0A')
        expect(method).toBe('TEST-CRC')
        return 'A1B2'
      }
    )

    expect(Array.from(result.data).map((value) => value.charCodeAt(0))).toEqual([
      1, 2, 13, 10, 161, 178
    ])
    expect(result.displayCommand).toBe('01 02 0D 0A A1 B2')
  })

  it('rejects invalid HEX input before any send operation', async () => {
    await expect(prepareCommand('0G', { hexMode: true })).rejects.toThrow('Invalid HEX command')
  })
})
