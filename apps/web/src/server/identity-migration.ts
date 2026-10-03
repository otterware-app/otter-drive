/** Explicit, operator-verified re-key. Run all statements in one D1 transaction. */
export function identityMigration(
  oldId: string,
  subject: string,
  accountId: string,
  now: string,
): string {
  const q = (s: string) => `'${s.replaceAll("'", "''")}'`,
    old = q(oldId),
    id = q(subject)
  const updates = [
    ['session', 'userId'],
    ['session', 'impersonatedBy'],
    ['deviceCode', 'userId'],
    ['account', 'userId'],
    ['folder', 'owner_user_id'],
    ['drive_member', 'user_id'],
    ['artifact', 'owner_user_id'],
    ['artifact_version', 'created_by_user_id'],
    ['apikey', 'referenceId'],
  ]
  return `PRAGMA defer_foreign_keys=ON;
 SELECT CASE WHEN (SELECT count(*) FROM user WHERE id=${old})=1 AND (${old}=${id} OR NOT EXISTS(SELECT 1 FROM user WHERE id=${id})) THEN 1 ELSE json('Identity conflict') END;
 UPDATE user SET id=${id} WHERE id=${old};
 ${updates.map(([table, column]) => `UPDATE ${table} SET ${column}=${id} WHERE ${column}=${old};`).join('\n')}
 UPDATE artifact SET created_by_actor_id=${id} WHERE created_by_actor_type='user' AND created_by_actor_id=${old};
 UPDATE artifact_upload SET actor_id=${id} WHERE actor_type='user' AND actor_id=${old};
 UPDATE audit_event SET actor_id=${id} WHERE actor_type='user' AND actor_id=${old};
 DELETE FROM account WHERE userId=${id} AND providerId!='otter';
 INSERT INTO account(id,accountId,providerId,userId,createdAt,updatedAt)
 SELECT ${q(accountId)},${id},'otter',${id},${q(now)},${q(now)} WHERE NOT EXISTS(SELECT 1 FROM account WHERE providerId='otter' AND userId=${id} AND accountId=${id});
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) THEN 1 ELSE json('Foreign key violation') END;
 `
}
