import type {
  AiConfigDocument,
  AiConfigPatch,
  AiInstanceConfig
} from '../../../../shared/extensions/ai-control/AiConfigTypes'
import AiConfigStorage from './AiConfigStorage'

export default class AiConfigService {
  constructor(
    private readonly storage: AiConfigStorage,
    private readonly instanceIndex: number
  ) {}

  get(): AiConfigDocument {
    return this.storage.get()
  }

  getInstance(): AiInstanceConfig {
    return this.storage.getInstance(this.instanceIndex)
  }

  patch(patch: AiConfigPatch): Promise<AiConfigDocument> {
    return this.storage.patch(this.instanceIndex, patch)
  }

  rotateToken(): Promise<AiConfigDocument> {
    return this.storage.rotateToken(this.instanceIndex)
  }

  refreshIfChanged(): Promise<void> {
    return this.storage.refreshIfChanged()
  }

  onChanged(listener: (config: AiConfigDocument) => void): () => void {
    return this.storage.onChanged(listener)
  }
}
