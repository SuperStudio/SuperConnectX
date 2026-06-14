import { describe, it, expect } from 'vitest'
import FormUtils from '../../src/renderer/src/utils/FormUtils'

describe('FormUtils', () => {
  describe('buildTelnet', () => {
    it('返回 ref({})', () => {
      const result = FormUtils.buildTelnet()
      expect(result).toBeDefined()
      expect(result.value).toEqual({})
    })
  })

  describe('buildPresetCmd', () => {
    it('返回 ref({})', () => {
      const result = FormUtils.buildPresetCmd()
      expect(result).toBeDefined()
      expect(result.value).toEqual({})
    })
  })

  describe('buildGroups', () => {
    it('返回空对象', () => {
      const result = FormUtils.buildGroups()
      expect(result).toEqual({})
    })
  })

  describe('buildGroupData', () => {
    it('返回包含默认值的 ref', () => {
      const result = FormUtils.buildGroupData()
      expect(result).toBeDefined()
      expect(result.value).toEqual({
        name: '',
        connectionType: 'telnet',
        copyFromGroupId: null
      })
    })
  })
})
