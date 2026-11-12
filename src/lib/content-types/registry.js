/**
 * First-party content-type registry (schema + declarative chat card + open-with).
 * Packages live in alpha-drive/content-types/; this module mirrors them for the Admin host.
 *
 * Chat cards: icon + type_name + title + optional summary / activity only.
 * No custom bubble JS/CSS from packages — see ADR-content-type-packages.
 */

/** @typedef {'native' | 'frame'} OpenMode */

/**
 * @typedef {{
 *   schema: 'alpha.content_type_manifest/1',
 *   id: string,
 *   version: string,
 *   title: string,
 *   description?: string,
 *   entity_schema: string,
 *   drive_root: string,
 *   first_party: true,
 *   open: { mode: OpenMode, native_route?: string, frame_entry?: string, bridge?: string },
 *   chat: {
 *     schema: 'alpha.content_type_chat/1',
 *     type_name: string,
 *     icon: string,
 *     title_path: string,
 *     summary_path?: string,
 *     activity?: Record<string, string>
 *   }
 * }} ContentTypePackage
 */

/** @type {ContentTypePackage[]} */
export const FIRST_PARTY_CONTENT_TYPES = [
	{
		schema: 'alpha.content_type_manifest/1',
		id: 'alpha.mail',
		version: '0.1.0',
		title: 'Mail',
		description: 'Mailbox messages on the Space Drive / JMAP archive.',
		entity_schema: 'alpha.mail_message/1',
		drive_root: 'mail/',
		first_party: true,
		open: { mode: 'native', native_route: '/mail?id={id}' },
		chat: {
			schema: 'alpha.content_type_chat/1',
			type_name: 'Mail',
			icon: 'mail',
			title_path: 'subject',
			summary_path: 'from',
			activity: {
				create: '{actor} sent mail',
				update: '{actor} updated mail',
				comment: '{actor} commented on mail'
			}
		}
	},
	{
		schema: 'alpha.content_type_manifest/1',
		id: 'alpha.tasks',
		version: '0.1.0',
		title: 'Tasks',
		entity_schema: 'alpha.task/3',
		drive_root: 'tasks/',
		first_party: true,
		open: { mode: 'native', native_route: '/tasks?id={id}' },
		chat: {
			schema: 'alpha.content_type_chat/1',
			type_name: 'Task',
			icon: 'tasks',
			title_path: 'title',
			summary_path: 'status',
			activity: {
				create: '{actor} created task',
				update: '{actor} updated task',
				comment: '{actor} commented on task'
			}
		}
	},
	{
		schema: 'alpha.content_type_manifest/1',
		id: 'alpha.projects',
		version: '0.1.0',
		title: 'Projects',
		entity_schema: 'alpha.project/1',
		drive_root: 'projects/',
		first_party: true,
		open: { mode: 'native', native_route: '/projects?id={id}' },
		chat: {
			schema: 'alpha.content_type_chat/1',
			type_name: 'Project',
			icon: 'projects',
			title_path: 'title',
			summary_path: 'status',
			activity: {
				create: '{actor} created project',
				update: '{actor} updated project',
				comment: '{actor} commented on project'
			}
		}
	},
	{
		schema: 'alpha.content_type_manifest/1',
		id: 'alpha.sheets',
		version: '0.1.0',
		title: 'Sheets',
		description: 'Modular typed tables (product name Sheets).',
		entity_schema: 'alpha.table/1',
		drive_root: 'tables/',
		first_party: true,
		open: { mode: 'native', native_route: '/entreprises?t={id}' },
		chat: {
			schema: 'alpha.content_type_chat/1',
			type_name: 'Sheet',
			icon: 'enterprise',
			title_path: 'title',
			summary_path: 'key',
			activity: {
				create: '{actor} created sheet',
				update: '{actor} updated sheet',
				comment: '{actor} commented on sheet'
			}
		}
	},
	{
		schema: 'alpha.content_type_manifest/1',
		id: 'alpha.notes',
		version: '0.1.0',
		title: 'Notes',
		entity_schema: 'alpha.note/1',
		drive_root: 'notes/',
		first_party: true,
		open: { mode: 'native', native_route: '/notes?id={id}' },
		chat: {
			schema: 'alpha.content_type_chat/1',
			type_name: 'Note',
			icon: 'notes',
			title_path: 'title',
			activity: {
				create: '{actor} created note',
				update: '{actor} updated note',
				comment: '{actor} commented on note'
			}
		}
	},
	{
		schema: 'alpha.content_type_manifest/1',
		id: 'alpha.ai_threads',
		version: '0.1.0',
		title: 'AI threads',
		entity_schema: 'alpha.ai_thread/1',
		drive_root: 'ai_threads/',
		first_party: true,
		open: { mode: 'native', native_route: '/ai-threads?id={id}' },
		chat: {
			schema: 'alpha.content_type_chat/1',
			type_name: 'AI thread',
			icon: 'chat',
			title_path: 'title',
			summary_path: 'status',
			activity: {
				create: '{actor} started AI thread',
				update: '{actor} updated AI thread',
				comment: '{actor} continued AI thread'
			}
		}
	},
	{
		schema: 'alpha.content_type_manifest/1',
		id: 'alpha.git_repos',
		version: '0.1.0',
		title: 'Git repos',
		entity_schema: 'alpha.git_repo/1',
		drive_root: 'git_repos/',
		first_party: true,
		/* Opens the forge (git.{apex} or external) — packfiles are not on Drive. */
		open: { mode: 'native', native_route: '{web_url}' },
		chat: {
			schema: 'alpha.content_type_chat/1',
			type_name: 'Git repo',
			icon: 'drive',
			title_path: 'title',
			summary_path: 'default_branch',
			activity: {
				create: '{actor} linked git repo',
				update: '{actor} updated git repo',
				comment: '{actor} commented on git repo'
			}
		}
	},
	{
		schema: 'alpha.content_type_manifest/1',
		id: 'alpha.files',
		version: '0.1.0',
		title: 'Files',
		entity_schema: 'alpha.media_blob/1',
		drive_root: 'files/',
		first_party: true,
		open: { mode: 'native', native_route: '/drive?path={path}' },
		chat: {
			schema: 'alpha.content_type_chat/1',
			type_name: 'File',
			icon: 'drive',
			title_path: 'name',
			summary_path: 'content_type',
			activity: {
				create: '{actor} added file',
				update: '{actor} updated file',
				comment: '{actor} commented on file'
			}
		}
	}
];

/** @type {Map<string, ContentTypePackage>} */
const byId = new Map(FIRST_PARTY_CONTENT_TYPES.map((p) => [p.id, p]));

/** @type {Map<string, ContentTypePackage>} */
const byEntitySchema = new Map(FIRST_PARTY_CONTENT_TYPES.map((p) => [p.entity_schema, p]));

/**
 * @param {string} id package id (alpha.tasks) or entity schema (alpha.task/3)
 * @returns {ContentTypePackage | null}
 */
export function getContentType(id) {
	const key = String(id || '').trim();
	if (!key) return null;
	return byId.get(key) || byEntitySchema.get(key) || null;
}

/** @returns {ContentTypePackage[]} */
export function listContentTypes() {
	return FIRST_PARTY_CONTENT_TYPES.slice();
}
