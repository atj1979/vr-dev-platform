function disposeMaterial(material) {
  if (!material) return;
  material.map?.dispose?.();
  material.dispose?.();
}

export function disposeGroup(group) {
  for (const child of [...group.children]) {
    child.traverse((node) => {
      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) node.material.forEach(disposeMaterial);
      else disposeMaterial(node.material);
    });
    group.remove(child);
  }
}

export function formatError(error) {
  const message = error?.message || String(error);
  const extra = (error?.stack || '').split('\n').slice(1, 3).join(' ').trim();
  return extra ? `${message} ${extra}` : message;
}

/**
 * Evaluate a scene module in the preview group.
 * The module runs in this page's realm. The sandbox is the group it receives,
 * not a separate security origin.
 */
export async function runModule(code, THREE, group) {
  disposeGroup(group);
  const blob = new Blob([code], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    const imported = await import(/* @vite-ignore */ url);
    const setup = imported.default;
    if (typeof setup !== 'function') {
      throw new Error('The module must default-export function (THREE, scene, ctx)');
    }
    const hooks = [];
    const ctx = {
      time: 0,
      onFrame(callback) {
        if (typeof callback === 'function') hooks.push(callback);
      },
    };
    let returned;
    try {
      returned = await setup(THREE, group, ctx);
    } catch (error) {
      disposeGroup(group);
      throw error;
    }
    let update = null;
    let dispose = null;
    if (typeof returned === 'function') dispose = returned;
    else if (returned && typeof returned === 'object') {
      update = typeof returned.update === 'function' ? returned.update : null;
      dispose = typeof returned.dispose === 'function' ? returned.dispose : null;
    }
    let failed = false;
    return {
      update(dt, time) {
        if (failed) return;
        ctx.time = time;
        try {
          update?.(dt, time);
          for (const hook of hooks) hook(dt, time);
        } catch (error) {
          failed = true;
          throw error;
        }
      },
      dispose() {
        try { dispose?.(); } catch { /* the next run replaces the group */ }
        disposeGroup(group);
      },
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
