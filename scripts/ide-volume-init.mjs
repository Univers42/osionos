// Sets a user's two volume roots to <uid>:10001 mode 700 before the box mounts them (ADR 0011,
// verdict A3). Runs the SANDBOX image at the real targets /workspace and /home/coder: Docker copies
// the image directory into an empty volume on first mount and resets its root to the image's owner,
// so an init from another image or path would be undone by the box's first mount (verdict F1/F3).
// The socket proxy validates this exact body (ideinit-* shape); change both together.
//
// Caveat: the init is bounded by INIT_TIMEOUT_MS of socket silence, and a wait that hits it leaves
// the init container running until the force-remove in `finally`; the volumes are then in whatever
// state chown stopped at, and the box is not created.

export const INIT_TIMEOUT_MS = 120_000;
export const HOME_REPAIR = "HOME_REPAIR";
export const HOME_REPAIR_MESSAGE = "home repair failed; try again in a minute";
const INIT_MEMORY_BYTES = 128 * 1024 * 1024;

/** `ideinit-<digest>`: same digest as the box, so the proxy can tie the init to its owner and workspace. */
export function initContainerName(digest) {
  return `ideinit-${digest}`;
}

export function buildInitSpec({ userId, workspaceId, image, uid, volumeName, homeVolumeName }) {
  return {
    Image: image,
    User: "0:0",
    // The image's own entrypoint never exits; this one chowns and exits.
    Entrypoint: ["/usr/local/sbin/osio-volume-init"],
    Cmd: [],
    Env: [`OSIO_UID=${uid}`],
    Labels: {
      "osio.ide.managed": "1",
      "osio.ide.owner": userId,
      "osio.ide.workspace": workspaceId,
      "osio.ide.uid": String(uid),
    },
    HostConfig: {
      NetworkMode: "none",
      CapDrop: ["ALL"],
      // DAC_READ_SEARCH lets chown -R walk the 0700 directories a previous uid left behind (verdict E3b).
      CapAdd: ["CHOWN", "DAC_READ_SEARCH", "FOWNER"],
      SecurityOpt: ["no-new-privileges:true"],
      ReadonlyRootfs: true,
      // No VolumeOptions: the copy-up has to happen here, not under the box (verdict F2).
      Mounts: [
        { Type: "volume", Source: volumeName, Target: "/workspace" },
        { Type: "volume", Source: homeVolumeName, Target: "/home/coder" },
      ],
      PidsLimit: 16,
      Memory: INIT_MEMORY_BYTES,
      MemorySwap: INIT_MEMORY_BYTES,
      RestartPolicy: { Name: "no" },
    },
  };
}

function homeRepairError(cause) {
  console.warn(`[osionos-ide] home repair failed: ${cause}`);
  return Object.assign(new Error(HOME_REPAIR_MESSAGE), { status: 503, code: HOME_REPAIR });
}

/** Run the init to completion and remove it. Throws a HOME_REPAIR error on a create/start failure,
 *  a non-zero exit or the time bound; the box must not be created after that. */
export async function runVolumeInit(docker, names, { image, uid, timeoutMs = INIT_TIMEOUT_MS }) {
  const name = initContainerName(names.digest);
  const spec = buildInitSpec({
    userId: names.userId, workspaceId: names.workspaceId, image, uid,
    volumeName: names.volumeName, homeVolumeName: names.homeVolumeName,
  });
  try {
    await docker.remove(name); // a leftover from a crashed bridge would 409 the create
    await docker.create(name, spec);
    await docker.start(name);
    const exitCode = await docker.waitStopped(name, timeoutMs);
    if (exitCode !== 0) throw new Error(`exit ${exitCode}`);
  } catch (error) {
    throw error?.code === HOME_REPAIR ? error : homeRepairError(error?.message ?? error);
  } finally {
    await docker.remove(name).catch(() => {});
  }
}
