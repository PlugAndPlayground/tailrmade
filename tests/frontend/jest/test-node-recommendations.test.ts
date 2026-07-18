import * as fs from 'fs';
import * as path from 'path';

describe('Node recommendations', () => {
  it('should only contain valid node names', () => {
    // Recursively get all .ts/.tsx files in a directory, excluding datatypes
    function getAllNodeFiles(dir: string): string[] {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
          if (file !== 'datatypes') {
            results = results.concat(getAllNodeFiles(filePath));
          }
        } else if (
          (file.endsWith('.ts') || file.endsWith('.tsx')) &&
          !file.endsWith('.d.ts')
        ) {
          results.push(filePath);
        }
      }
      return results;
    }

    // Extract exported class names (any class, not just PPNode)
    function extractNodeClassNames(filePath: string): string[] {
      const content = fs.readFileSync(filePath, 'utf8');
      const classRegex = /export class (\w+)/g;
      const names: string[] = [];
      let match;
      while ((match = classRegex.exec(content)) !== null) {
        names.push(match[1]);
      }
      return names;
    }

    // Get all valid node names by scanning node files
    function getAllNodeNames(): Set<string> {
      const nodesDir = path.join(__dirname, '..', '..', '..', 'src', 'nodes');
      const files = getAllNodeFiles(nodesDir);
      const nodeNames = new Set<string>();
      for (const file of files) {
        const classNames = extractNodeClassNames(file);
        for (const name of classNames) {
          nodeNames.add(name.toLowerCase());
        }
      }
      return nodeNames;
    }

    // Function to find all datatype files with recommended functions
    function findDatatypeFiles(): string[] {
      const datatypesDir = path.join(
        __dirname,
        '..',
        '..',
        '..',
        'src',
        'nodes',
        'datatypes',
      );
      const files = fs.readdirSync(datatypesDir);
      return files
        .filter((file) => file.endsWith('.tsx') || file.endsWith('.ts'))
        .map((file) => path.join(datatypesDir, file));
    }

    // Function to extract recommended node names from a file
    function extractRecommendedNodes(filePath: string): {
      file: string;
      recommendedOutputNodeWidgets: string[];
      recommendedInputNodeWidgets: string[];
    } {
      const content = fs.readFileSync(filePath, 'utf8');
      const results = {
        file: path.basename(filePath),
        recommendedOutputNodeWidgets: [] as string[],
        recommendedInputNodeWidgets: [] as string[],
      };
      // Extract recommendedOutputNodeWidgets
      const outputRegex =
        /recommendedOutputNodeWidgets\(\):\s*string\[\]\s*{\s*return\s*\[([^\]]*)\]/s;
      const outputMatch = content.match(outputRegex);
      if (outputMatch) {
        const nodeList = outputMatch[1];
        results.recommendedOutputNodeWidgets =
          extractNodeNamesFromArray(nodeList);
      }
      // Extract recommendedInputNodeWidgets
      const inputRegex =
        /recommendedInputNodeWidgets\(\):\s*string\[\]\s*{\s*return\s*\[([^\]]*)\]/s;
      const inputMatch = content.match(inputRegex);
      if (inputMatch) {
        const nodeList = inputMatch[1];
        results.recommendedInputNodeWidgets =
          extractNodeNamesFromArray(nodeList);
      }
      return results;
    }

    // Function to extract node names from array string
    function extractNodeNamesFromArray(arrayString: string): string[] {
      return arrayString
        .split(',')
        .map((item) => item.trim().replace(/['"]/g, ''))
        .filter((item) => item.length > 0);
    }

    // Function to validate node names
    function validateNodeNames(
      recommendedNodes: string[],
      allNodeNames: Set<string>,
    ): string[] {
      const invalidNodes: string[] = [];
      for (const nodeName of recommendedNodes) {
        if (!allNodeNames.has(nodeName)) {
          invalidNodes.push(nodeName);
        }
      }
      return invalidNodes;
    }

    // Main test logic
    const allNodeNames = getAllNodeNames();
    const datatypeFiles = findDatatypeFiles();
    let totalIssues = 0;
    let filesWithIssues = 0;
    let errorMessages: string[] = [];
    for (const filePath of datatypeFiles) {
      const results = extractRecommendedNodes(filePath);
      if (
        results.recommendedOutputNodeWidgets.length > 0 ||
        results.recommendedInputNodeWidgets.length > 0
      ) {
        let fileHasIssues = false;
        // Validate recommendedOutputNodeWidgets
        if (results.recommendedOutputNodeWidgets.length > 0) {
          const invalidOutputNodes = validateNodeNames(
            results.recommendedOutputNodeWidgets,
            allNodeNames,
          );
          if (invalidOutputNodes.length > 0) {
            errorMessages.push(
              `${results.file}: Invalid recommendedOutputNodeWidgets: ${invalidOutputNodes.join(', ')}`,
            );
            totalIssues += invalidOutputNodes.length;
            fileHasIssues = true;
          }
        }
        // Validate recommendedInputNodeWidgets
        if (results.recommendedInputNodeWidgets.length > 0) {
          const invalidInputNodes = validateNodeNames(
            results.recommendedInputNodeWidgets,
            allNodeNames,
          );
          if (invalidInputNodes.length > 0) {
            errorMessages.push(
              `${results.file}: Invalid recommendedInputNodeWidgets: ${invalidInputNodes.join(', ')}`,
            );
            totalIssues += invalidInputNodes.length;
            fileHasIssues = true;
          }
        }
        if (fileHasIssues) {
          filesWithIssues++;
        }
      }
    }
    if (totalIssues > 0) {
      throw new Error(
        `Found ${totalIssues} invalid node recommendations in ${filesWithIssues} files:\n` +
          errorMessages.join('\n'),
      );
    }
  });
});
