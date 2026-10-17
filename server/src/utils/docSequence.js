import pool from '../db/connection.js';

/**
 * Atomically generates the next document number for a given document type.
 * @param {string} docType - e.g. 'PO', 'SO', 'WO', 'GRN', 'DEL', 'INV', 'ADJ', 'NCR', 'INSP', 'MOV'
 * @param {object} [client] - Optional pg client if already inside a transaction
 * @returns {Promise<string>} - Formatted document number
 */
export async function getNextDocNumber(docType, client = null) {
  const runner = client || pool;
  const currentYear = new Date().getFullYear();

  const query = `
    SELECT doc_type, prefix, next_val, padding, format
    FROM document_sequences
    WHERE doc_type = $1
    FOR UPDATE;
  `;

  const { rows } = await runner.query(query, [docType]);

  if (rows.length === 0) {
    // Default fallback if doc_type not seeded yet
    const fallbackSeq = 1;
    await runner.query(`
      INSERT INTO document_sequences (doc_type, prefix, next_val, padding, format)
      VALUES ($1, $1, 2, 4, '{prefix}-{year}-{number}')
      ON CONFLICT (doc_type) DO NOTHING;
    `, [docType]);
    return `${docType}-${currentYear}-${String(fallbackSeq).padStart(4, '0')}`;
  }

  const seq = rows[0];
  const numStr = String(seq.next_val).padStart(seq.padding || 4, '0');
  
  // Format string substitution: {prefix}-{year}-{number}
  let docNumber = seq.format || '{prefix}-{year}-{number}';
  docNumber = docNumber.replace('{prefix}', seq.prefix);
  docNumber = docNumber.replace('{year}', currentYear);
  docNumber = docNumber.replace('{number}', numStr);

  // Increment sequence
  await runner.query(`
    UPDATE document_sequences
    SET next_val = next_val + 1
    WHERE doc_type = $1;
  `, [docType]);

  return docNumber;
}
