import { and, desc, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { db, schema } from '$lib/server/db';
import type { Note } from '$lib/server/db/schema/notes';
import type { NoteInput } from '$lib/notes/schema';

/**
 * The repository layer. Every query for this resource lives here, and routes
 * never import drizzle directly — that is the rule the whole data branch rests
 * on, because it is what makes the SQL auditable and the dialect swappable.
 *
 * Note the shape of each function: ownership is a REQUIRED argument, not an
 * optional filter. A repository whose `get(id)` can be called without an owner
 * will eventually be called without one.
 */

export async function listNotes(userId: string): Promise<Note[]> {
	return db()
		.select()
		.from(schema.notes)
		.where(eq(schema.notes.userId, userId))
		.orderBy(desc(schema.notes.updatedAt));
}

/** Scoped by owner, so a wrong id and someone else's id are indistinguishable. */
export async function getNote(id: string, userId: string): Promise<Note | undefined> {
	const rows = await db()
		.select()
		.from(schema.notes)
		.where(and(eq(schema.notes.id, id), eq(schema.notes.userId, userId)))
		.limit(1);

	return rows[0];
}

export async function createNote(userId: string, input: NoteInput): Promise<Note> {
	const now = new Date();
	const [row] = await db()
		.insert(schema.notes)
		.values({ id: ulid(), userId, ...input, createdAt: now, updatedAt: now })
		.returning();

	return row;
}

/** Returns undefined when the note isn't the caller's — the caller 404s. */
export async function updateNote(
	id: string,
	userId: string,
	input: NoteInput
): Promise<Note | undefined> {
	const [row] = await db()
		.update(schema.notes)
		.set({ ...input, updatedAt: new Date() })
		.where(and(eq(schema.notes.id, id), eq(schema.notes.userId, userId)))
		.returning();

	return row;
}

export async function deleteNote(id: string, userId: string): Promise<boolean> {
	const rows = await db()
		.delete(schema.notes)
		.where(and(eq(schema.notes.id, id), eq(schema.notes.userId, userId)))
		.returning({ id: schema.notes.id });

	return rows.length > 0;
}
