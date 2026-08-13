// attachmentFolder.ts
//
// Where a note's attachments live, and whether a given folder is one of ours.
//
// Extracted from main.ts so it can be tested without Obsidian: both functions depend
// only on the settings and, for the matcher, on a callback that answers "does a note
// exist at this path". `matchAttachmentFolder` gates every destructive action in the
// plugin — which folders are hidden, which are deleted once empty, which attachments
// may be moved — so it is the single most valuable thing here to have covered.

import { normalizePath } from 'obsidian';
import { AttachmentFolderLocationType, ImportAttachmentsSettings, ParsedPath } from 'types';
import { joinPaths, parseFolderPath } from 'utils';

const NOTENAME_PLACEHOLDER = '${notename}';

/** The attachment folder for a note, as a vault-relative POSIX path. */
export function attachmentFolderOfNote(
	settings: Pick<ImportAttachmentsSettings, 'attachmentFolderPath' | 'attachmentFolderLocation'>,
	note: ParsedPath,
): string {
	const folderPath = settings.attachmentFolderPath.replace(/\$\{notename\}/g, note.filename);

	let attachmentsFolderPath;
	switch (settings.attachmentFolderLocation) {
	case AttachmentFolderLocationType.CURRENT:
		attachmentsFolderPath = note.dir;
		break;
	case AttachmentFolderLocationType.SUBFOLDER:
		attachmentsFolderPath = joinPaths(note.dir, folderPath);
		break;
	case AttachmentFolderLocationType.ROOT:
		attachmentsFolderPath = '/';
		break;
	case AttachmentFolderLocationType.FOLDER:
		attachmentsFolderPath = folderPath;
		break;
	}

	return normalizePath(attachmentsFolderPath);
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

/**
 * Compile a predicate that recognises folders this plugin manages.
 *
 * `noteExists` is asked whether a note file exists at a given vault path, without its
 * extension — the caller checks both `.md` and `.canvas`. In SUBFOLDER mode a folder
 * only qualifies if the note it is named after actually exists, which is what stops
 * an unrelated folder that happens to match the pattern from being treated as ours.
 *
 * ROOT and CURRENT always return false: every note shares one folder there, so no
 * folder is identifiable as belonging to a particular note, and treating them as
 * attachment folders would put unrelated files at risk.
 */
export function compileAttachmentFolderMatcher(
	settings: Pick<ImportAttachmentsSettings, 'attachmentFolderPath' | 'attachmentFolderLocation'>,
	noteExists: (pathWithoutExtension: string) => boolean,
): (folderPath: string) => boolean {
	switch (settings.attachmentFolderLocation) {
	case AttachmentFolderLocationType.CURRENT:
	case AttachmentFolderLocationType.ROOT:
		return () => false;
	case AttachmentFolderLocationType.FOLDER:
	case AttachmentFolderLocationType.SUBFOLDER:
		/* continue */
	}

	const folderPath = settings.attachmentFolderPath;

	if (!folderPath.includes(NOTENAME_PLACEHOLDER)) {
		// A single shared folder: it is ours, but it belongs to no particular note.
		if (settings.attachmentFolderLocation === AttachmentFolderLocationType.FOLDER) {
			return (candidate: string): boolean => candidate === folderPath;
		}
		return (candidate: string): boolean =>
			candidate.endsWith(`/${folderPath}`) || candidate === folderPath;
	}

	const firstIndex = folderPath.indexOf(NOTENAME_PLACEHOLDER);
	const lastIndex = folderPath.lastIndexOf(NOTENAME_PLACEHOLDER);
	const folderPathStartsWith = folderPath.substring(0, firstIndex);
	const folderPathEndsWith = folderPath.substring(lastIndex + NOTENAME_PLACEHOLDER.length);

	const [leftPart, rightPart] = folderPath.split(NOTENAME_PLACEHOLDER);
	const regex = new RegExp(`^${escapeRegex(leftPart)}(.*?)${escapeRegex(rightPart)}$`);

	const isSubfolderSetting = settings.attachmentFolderLocation === AttachmentFolderLocationType.SUBFOLDER;

	return (candidate: string): boolean => {
		// Cheap check first: the folder name has to start and end the right way.
		const startsWithMatch = candidate.startsWith(folderPathStartsWith)
			|| candidate.includes(`/${folderPathStartsWith}`);
		const endsWithMatch = candidate.endsWith(folderPathEndsWith);
		const heuristicMatch = startsWithMatch && endsWithMatch;

		if (heuristicMatch && isSubfolderSetting) {
			const { foldername, dir } = parseFolderPath(candidate);
			const match = foldername.match(regex);
			if (match && match[1]) {
				return noteExists(normalizePath(joinPaths(dir, match[1])));
			}
			return false;
		}

		return heuristicMatch;
	};
}
