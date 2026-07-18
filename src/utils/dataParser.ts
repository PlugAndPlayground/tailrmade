// crazy claude function
export function isCSV(text) {
  // If empty or not a string, return false
  if (!text || typeof text !== 'string') {
    return false;
  }

  // Split into lines and remove empty lines
  const lines = text
    .trim()
    .split('\n')
    .filter((line) => line.trim());

  if (lines.length < 2) {
    return false; // Need at least header and one data row
  }

  // Detect the most likely delimiter
  const possibleDelimiters = [',', ';', '\t', '|'];
  const delimiterCounts = {};

  // Count occurrences of each delimiter in the first line
  possibleDelimiters.forEach((delimiter) => {
    delimiterCounts[delimiter] = (
      lines[0].match(new RegExp(`\\${delimiter}`, 'g')) || []
    ).length;
  });

  // Find the most common delimiter
  const mostLikelyDelimiter = Object.entries(delimiterCounts).reduce((a, b) =>
    a[1] > b[1] ? a : b,
  )[0];

  if (delimiterCounts[mostLikelyDelimiter] === 0) {
    return false; // No common delimiter found
  }

  // Check if all lines have the same number of fields
  const firstLineFieldCount = lines[0].split(mostLikelyDelimiter).length;

  // Calculate consistency score (percentage of lines with same number of fields)
  const consistentLines = lines.filter(
    (line) => line.split(mostLikelyDelimiter).length === firstLineFieldCount,
  );
  const consistencyScore = consistentLines.length / lines.length;

  // Check for quotes around fields (common in CSVs)
  const hasQuotedFields = lines.some(
    (line) => line.includes('"') || line.includes("'"),
  );

  // Calculate how many fields appear to be numeric or dates
  const sampleLine = lines[1].split(mostLikelyDelimiter);
  const numericOrDateFields = sampleLine.filter((field) => {
    const trimmed = field.trim().replace(/["']/g, '');
    // Check if it's a number
    if (!isNaN(Number(trimmed))) return true;
    // Check if it's a date
    if (Date.parse(trimmed)) return true;
    return false;
  }).length;
  const numericRatio = numericOrDateFields / sampleLine.length;

  // Scoring system (0-100)
  let score = 0;

  // Regular structure bonus (up to 40 points)
  score += consistencyScore * 40;

  // Number of fields bonus (up to 20 points)
  score += Math.min(firstLineFieldCount * 2, 20);

  // Quoted fields bonus (10 points)
  if (hasQuotedFields) score += 10;

  // Numeric/date fields ratio bonus (up to 30 points)
  score += numericRatio * 30;

  return {
    isCSV: score >= 50,
    confidence: score,
    delimiter: mostLikelyDelimiter,
    fieldCount: firstLineFieldCount,
    sampleSize: lines.length,
    details: {
      consistencyScore,
      hasQuotedFields,
      numericFieldRatio: numericRatio,
      score,
    },
  };
}
