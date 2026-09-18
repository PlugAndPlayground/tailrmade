/** Allow rendering to catch up without hanging when background frames stop. */
export const waitForFrames = async (count = 2): Promise<void> => {
  for (let frame = 0; frame < count; frame++) {
    await new Promise<void>((resolve) => {
      let frameId: number | undefined;
      const finish = () => {
        if (frameId !== undefined) {
          window.cancelAnimationFrame(frameId);
        }
        window.clearTimeout(timeout);
        resolve();
      };
      // Arm this even while visible: the tab may be hidden before the callback.
      const timeout = window.setTimeout(finish, 100);
      if (!document.hidden) {
        frameId = window.requestAnimationFrame(finish);
      }
    });
  }
};
