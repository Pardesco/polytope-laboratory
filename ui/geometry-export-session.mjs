import { captureNativeSource, verifyNativeSource } from './native-source-binding.mjs';
import { publishBoundedExport } from './bounded-export.mjs';
const abort = () => Object.assign(Error('Geometry export canceled or superseded.'), { name: 'AbortError' });

/** A reviewed export belongs to one source, metadata record and set of options. */
export class GeometryExportSession {
  constructor(context) {
    this.context = context;
    this.generation = 0;
    this.prepared = null;
    this.preparing = false;
    this.saving = false;
  }
  capture() {
    const native = captureNativeSource(this.context),
      model = this.context.getGeometry();
    if (!model) throw Error('Choose an available geometry source.');
    return {
      native,
      model,
      modelSignature: JSON.stringify(model),
      selection: structuredClone(this.context.getSelection()),
      metadata: JSON.stringify(native.state.view.documentMetadata ?? null),
      scope: this.context.getScope?.(),
      displaySignature: this.context.getDisplaySignature?.(),
    };
  }
  verify(owner) {
    if (this.context.isOpen?.() === false || (this.context.getScope && this.context.getScope() !== owner.scope))
      throw abort();
    verifyNativeSource(this.context, owner.native);
    if (
      this.context.getGeometry() !== owner.model ||
      JSON.stringify(owner.model) !== owner.modelSignature ||
      JSON.stringify(this.context.getSelection()) !== JSON.stringify(owner.selection) ||
      JSON.stringify(owner.native.state.view.documentMetadata ?? null) !== owner.metadata ||
      this.context.getDisplaySignature?.() !== owner.displaySignature
    )
      throw Error('Export geometry, metadata or options changed. Review the export again.');
  }
  async prepare() {
    if (this.saving) throw Error('Finish the current geometry export first.');
    this.cancel();
    const generation = this.generation,
      controller = new AbortController();
    this.controller = controller;
    this.preparing = true;
    let owner;
    const verify = () => {
      if (controller.signal.aborted || generation !== this.generation) throw abort();
      this.verify(owner);
    };
    this.context.onState?.();
    try {
      owner = this.capture();
      verify();
      if (this.context.beforeCapture) {
        await this.context.beforeCapture({
          signal: controller.signal,
          isCurrent: () => !controller.signal.aborted && generation === this.generation,
        });
        if (controller.signal.aborted || generation !== this.generation) throw abort();
        owner.displaySignature = this.context.getDisplaySignature?.();
        verify();
      }
      const options = await this.context.describe(JSON.parse(owner.modelSignature), { signal: controller.signal });
      verify();
      if (!Array.isArray(options?.formats)) throw Error('Export format availability is unavailable.');
      this.context.useOptions?.(options);
      owner = this.capture();
      verify();
      const selected = options.formats.find((row) => row.format === owner.selection.format);
      if (!selected?.available) throw Error(selected?.reason || 'Choose an available geometry export format.');
      // Empty document fields are intentional edits; omitted parameters would
      // let the native exporter retain stale metadata from the imported model.
      const params = {
        format: owner.selection.format,
        source_unit: owner.native.unit,
        target_unit: owner.selection.unit,
        include_text: true,
        document_metadata: JSON.parse(owner.metadata) ?? {},
        notes: owner.native.notes ?? '',
      };
      if (owner.selection.dxf) params.dxf_profile = owner.selection.dxf.profile;
      const result = await this.context.prepare(JSON.parse(owner.modelSignature), params, {
        signal: controller.signal,
      });
      verify();
      if (
        typeof result?.text !== 'string' ||
        !Array.isArray(result.report?.losses) ||
        result.report.sourceUnit !== params.source_unit ||
        result.report.targetUnit !== params.target_unit
      )
        throw Error('Prepared export does not match the reviewed units or format.');
      this.prepared = { owner, result, generation };
      return result;
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation) throw abort();
      throw error;
    } finally {
      if (this.controller === controller) {
        this.preparing = false;
        this.controller = null;
        this.context.onState?.();
      }
    }
  }
  async confirm() {
    if (this.saving) throw Error('Finish the current geometry export first.');
    if (this.preparing || !this.prepared) throw Error('Wait for the export preview before choosing a file.');
    const prepared = this.prepared;
    this.verify(prepared.owner);
    const controller = new AbortController();
    this.controller = controller;
    this.saving = true;
    this.context.onState?.();
    const verify = () => {
      if (controller.signal.aborted || prepared.generation !== this.generation || this.prepared !== prepared)
        throw abort();
      this.verify(prepared.owner);
    };
    const { api } = this.context,
      format = prepared.owner.selection.format;
    const defaultName =
      (prepared.owner.model.name ?? 'Model')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .slice(0, 160)
        .replace(/[. ]+$/, '') || 'Model';
    try {
      let payload = prepared.result.text;
      if (prepared.result.report.encoding === 'base64') {
        if (
          !(prepared.owner.selection.printable?.enabled && ['stl', '3mf', 'glb'].includes(format)) &&
          !(prepared.owner.selection.displayed?.enabled && format === 'glb')
        )
          throw Error('Unexpected binary geometry export format.');
        payload = Uint8Array.fromBase64
          ? Uint8Array.fromBase64(payload)
          : Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
      }
      if (prepared.result.materials !== undefined) {
        if (format !== 'obj' || typeof prepared.result.materials !== 'string')
          throw Error('Unexpected material export payload.');
        payload = { obj: payload, mtl: prepared.result.materials };
      }
      return await publishBoundedExport(
        {
          beginTextExport: api.beginGeometryExport,
          writeTextExport: api.writeGeometryExport,
          abortTextExport: api.abortGeometryExport,
        },
        format,
        payload,
        {
          signal: controller.signal,
          verifyPublication: verify,
          defaultName,
          extension: format === 'vrml' ? 'wrl' : format,
        }
      );
    } finally {
      if (this.controller === controller) {
        this.saving = false;
        this.controller = null;
        this.context.onState?.();
      }
    }
  }
  cancel() {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.prepared = null;
    this.preparing = false;
    this.saving = false;
    this.context.onState?.();
  }
}
