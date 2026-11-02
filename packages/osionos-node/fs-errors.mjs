/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   fs-errors.mjs                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/01 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/01 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// errno to the wire's error names (F7): the editor page sees FsErrorCode names, never errno text or
// an absolute path.
const ERRNO = {
	ENOENT: 'NotFound', EACCES: 'PermissionDenied', EPERM: 'PermissionDenied', ENOTDIR: 'NotADirectory', EISDIR: 'IsADirectory',
	ENOTEMPTY: 'NotEmpty', EEXIST: 'AlreadyExists', ELOOP: 'Loop', ENOSPC: 'NoSpace', EDQUOT: 'NoSpace', EROFS: 'ReadOnly',
	EFBIG: 'TooLarge', ENAMETOOLONG: 'Unsupported', EINVAL: 'Unsupported', EXDEV: 'Unsupported', EINTR: 'Interrupted', EMFILE: 'NoSpace', ENFILE: 'NoSpace',
};

export class FsWireError extends Error {
	constructor(code) {
		super(code);
		this.wireCode = code;
	}
}

/** An errno error or a wire name, as the error the service answers with. */
export function fsFail(cause) {
	if (typeof cause === 'string') return new FsWireError(cause);
	if (cause instanceof FsWireError) return cause;
	return new FsWireError(ERRNO[cause?.code] ?? 'Io');
}
