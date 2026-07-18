import PPStorage from '../../PPStorage';
import PPNode from '../../classes/NodeClass';
import Socket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import { NODE_TYPE_COLOR, SOCKET_TYPE } from '../../utils/constants';
import { TRgba } from '../../utils/color';
import { FileType } from '../datatypes/fileType';
import { ArrayType } from '../datatypes/arrayType';
import { JSONType } from '../datatypes/jsonType';
import { NumberType } from '../datatypes/numberType';
import { DynamicImport } from '../../utils/dynamicImport';
import InterfaceController, { ListenEvent } from '../../InterfaceController';

export const inputResourceIdSocketName = 'PDF File';
const outputMetadataSocketName = 'Metadata';
const outputOutlineSocketName = 'Outline';
const pageRangeStartSocketName = 'Start Page';
const pageRangeEndSocketName = 'End Page';
const outputPagesSocketName = 'Pages';
const pageScaleSocketName = 'Page Scale';

// Updated version and import approach
const PACKAGE_NAME = 'pdfjs-dist';
const PDF_WORKER_VERSION = '5.3.31';
const IMPORT_NAME = `${PACKAGE_NAME}@${PDF_WORKER_VERSION}`;

export class PDFReader extends PPNode {
  pdfjsLib: any;
  pdfDocument: any;
  currentResourceId: string = '';
  listenerId: any;

  public getName(): string {
    return 'PDF Reader';
  }

  public getDescription(): string {
    return 'Reads and extracts text content and page images from PDF files';
  }

  public getTags(): string[] {
    return ['Input', 'Text'].concat(super.getTags());
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.INPUT);
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(false, true, false, 1000, this);
  }

  public getDynamicImports(): string[] {
    return [IMPORT_NAME];
  }

  protected getDefaultIO(): Socket[] {
    return [
      new Socket(
        SOCKET_TYPE.IN,
        inputResourceIdSocketName,
        new FileType(['pdf']),
        '',
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        pageRangeStartSocketName,
        new NumberType(true, 1, 100),
        1,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        pageRangeEndSocketName,
        new NumberType(true, 1, 100),
        undefined,
        false,
      ),
      new Socket(
        SOCKET_TYPE.IN,
        pageScaleSocketName,
        new NumberType(false, 0.1, 5),
        1.0,
        false,
      ),
      new Socket(
        SOCKET_TYPE.OUT,
        outputPagesSocketName,
        new ArrayType(),
        [],
        true,
      ),
      new Socket(
        SOCKET_TYPE.OUT,
        outputMetadataSocketName,
        new JSONType(),
        {},
        false,
      ),
      new Socket(
        SOCKET_TYPE.OUT,
        outputOutlineSocketName,
        new JSONType(),
        {},
        false,
      ),
    ];
  }

  public async onNodeAdded(source): Promise<void> {
    await super.onNodeAdded(source);

    try {
      // Import the main PDF.js library
      const pdfModule = await DynamicImport.dynamicImport(IMPORT_NAME);
      this.pdfjsLib = pdfModule;
      console.log(this.pdfjsLib);

      // Configure the worker using esm.run consistently with DynamicImport utility
      const workerSrc = `https://cdn.jsdelivr.net/npm/${IMPORT_NAME}/build/pdf.worker.min.mjs`;
      this.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

      // Log appropriate message based on context
      if (!(typeof window !== 'undefined' && window.isSecureContext)) {
        console.warn(
          'PDF.js running in non-secure context, some features may be limited',
        );
      }

      // Add resource update listener
      this.listenerId = InterfaceController.addListener(
        ListenEvent.ResourceUpdated,
        (data: any) => {
          const resourceId = this.getInputData(inputResourceIdSocketName);
          if (data.id === resourceId) {
            this.loadPDFDocument(resourceId, true)
              .then(() => this.executeOptimizedChain())
              .catch((err) => console.error('Error updating PDF:', err));
          }
        },
      );
    } catch (error) {
      console.error('Failed to initialize PDF.js:', error);
    }
  }

  private async loadResourceLocal(resourceId: string): Promise<Blob | null> {
    try {
      return await PPStorage.getInstance().loadResource(resourceId);
    } catch (error) {
      console.error('Error loading resource:', error);
      return null;
    }
  }

  protected async onExecute(
    inputObject: any,
    outputObject: Record<string, unknown>,
  ): Promise<void> {
    const resourceId = inputObject[inputResourceIdSocketName];
    const startPage = Math.max(1, inputObject[pageRangeStartSocketName]);
    const endPage = inputObject[pageRangeEndSocketName];
    const pageScale = inputObject[pageScaleSocketName] || 1.0;

    // Initialize empty outputs
    const emptyOutputs = {
      [outputPagesSocketName]: [],
      [outputMetadataSocketName]: {},
      [outputOutlineSocketName]: [],
    };

    // If no PDF file, return empty outputs
    if (!resourceId) {
      Object.assign(outputObject, emptyOutputs);
      return;
    }

    try {
      // Load the document if needed (resource changed or not loaded yet)
      if (this.currentResourceId !== resourceId || !this.pdfDocument) {
        await this.loadPDFDocument(resourceId);
      }

      if (!this.pdfDocument) {
        throw new Error('Could not load PDF document');
      }

      // Calculate page range
      const maxPage = this.pdfDocument.numPages;
      const start = Math.max(1, Math.min(startPage, maxPage));
      const end = endPage ? Math.min(endPage, maxPage) : maxPage;

      // Extract text content from pages
      const pageTexts = await this.extractPageText(
        this.pdfDocument,
        start,
        end,
      );

      // Generate page images
      const pagesToRender = Array.from({ length: end - start + 1 }, (_, i) => ({
        pageNumber: start + i,
        index: i,
      }));

      // Render pages and get image data URIs
      const pageImages = await this.renderPDFPages(
        this.pdfDocument,
        pagesToRender,
        pageScale,
      );

      // Combine text and images into page objects
      const pages = pageTexts.map((text, index) => ({
        pageNumber: start + index,
        text,
        thumbnail: pageImages[index] || null,
      }));

      outputObject[outputPagesSocketName] = pages;

      // Extract metadata
      try {
        const metadata = await this.extractMetadata(this.pdfDocument);
        outputObject[outputMetadataSocketName] = metadata;
      } catch (metadataError) {
        console.warn('Failed to extract metadata:', metadataError);
        outputObject[outputMetadataSocketName] = {
          error: metadataError.message,
        };
      }

      // Extract outline/bookmarks
      try {
        let outline = [];
        if (this.pdfDocument.getOutline) {
          outline = await this.pdfDocument.getOutline();
        }
        outputObject[outputOutlineSocketName] = outline || [];
      } catch (outlineError) {
        console.warn('Failed to extract document outline:', outlineError);
        outputObject[outputOutlineSocketName] = [];
      }
    } catch (error) {
      console.error('PDF processing error:', error);
      Object.assign(outputObject, {
        ...emptyOutputs,
        [outputMetadataSocketName]: { error: error.message },
      });
    }
  }

  /**
   * Load PDF document and store it directly on the node (like SqliteReader)
   */
  private async loadPDFDocument(
    resourceId: string,
    forceReload = false,
  ): Promise<boolean> {
    if (
      this.currentResourceId === resourceId &&
      this.pdfDocument &&
      !forceReload
    ) {
      return true; // Already loaded
    }

    try {
      // Clear any existing document
      if (this.pdfDocument) {
        try {
          await this.pdfDocument.destroy();
        } catch (e) {
          // Ignore errors during cleanup
        }
        this.pdfDocument = null;
      }

      // Load the PDF file from storage
      const blob = await this.loadResourceLocal(resourceId);
      if (!blob) {
        throw new Error('Could not load PDF file');
      }

      // Get arrayBuffer from blob
      const arrayBuffer = await blob.arrayBuffer();

      // Get PDF.js document loading function
      let getDocumentFn = this.pdfjsLib.getDocument;

      // Load the document
      const loadingTask = this.pdfjsLib.getDocument({
        data: arrayBuffer,
        // Add these options for PDF.js 5.3.31
        // Enable WebAssembly JPEG 2000 support if needed
        useWorkerFetch: true,
        isEvalSupported: true,
      });
      this.pdfDocument = await loadingTask.promise;
      this.currentResourceId = resourceId;
      console.log(
        `PDF document loaded successfully: ${this.pdfDocument.numPages} pages`,
      );

      return true;
    } catch (error) {
      console.error('Error loading PDF document:', error);
      this.pdfDocument = null;
      this.currentResourceId = '';
      return false;
    }
  }

  /**
   * Extract text content from PDF pages
   */
  private async extractPageText(
    pdfDocument: any,
    startPage: number,
    endPage: number,
  ): Promise<string[]> {
    const pages: string[] = [];

    for (let i = startPage; i <= endPage; i++) {
      try {
        const page = await pdfDocument.getPage(i);
        const textContent = await page.getTextContent();

        // Sort items by their vertical position (y-coordinate) and then by horizontal (x-coordinate)
        const sortedItems = textContent.items.sort((a: any, b: any) => {
          // PDF coordinates typically start from bottom, so we invert for easier processing
          // Transform[5] is typically the y-coordinate in the transform matrix
          if (Math.abs(b.transform[5] - a.transform[5]) > 3) {
            // If y difference is significant, it's a different line
            return b.transform[5] - a.transform[5];
          } else {
            // Same line, sort by x coordinate (left to right)
            return a.transform[4] - b.transform[4];
          }
        });

        // Process sorted items to re-create text with line breaks
        let lastY: number | null = null;
        const lines: string[] = [];
        let currentLine = '';

        sortedItems.forEach((item: any) => {
          const itemY = item.transform[5];
          const text = item.str || '';

          // Skip empty items
          if (!text.trim()) return;

          // Check if we're on a new line (with some tolerance)
          if (lastY !== null && Math.abs(itemY - lastY) > 3) {
            lines.push(currentLine);
            currentLine = text;
          } else {
            // Same line, add space if needed
            if (currentLine && text) {
              currentLine += ' ' + text;
            } else {
              currentLine += text;
            }
          }

          lastY = itemY;
        });

        // Add the last line if there is one
        if (currentLine) {
          lines.push(currentLine);
        }

        // Join lines with proper line breaks
        const pageText = lines.join('\n');
        pages.push(pageText);
      } catch (error) {
        console.error(`Error extracting text from page ${i}:`, error);
        pages.push(`[Error extracting text from page ${i}]`);
      }
    }

    return pages;
  }

  /**
   * Extract metadata from PDF document
   */
  private async extractMetadata(pdfDocument: any): Promise<any> {
    try {
      const metadataObj = await pdfDocument.getMetadata();
      let metadata = metadataObj.info || {};

      if (metadataObj.metadata) {
        try {
          // Attempt to get XMP metadata if available
          const xmp = metadataObj.metadata.getAll() || {};
          metadata = { ...metadata, xmp };
        } catch (e) {
          console.warn('Could not extract XMP metadata', e);
        }
      }

      return metadata;
    } catch (error) {
      console.warn('Error fetching metadata:', error);
      return { error: 'Failed to extract metadata' };
    }
  }

  /**
   * Render PDF pages as images
   */
  private async renderPDFPages(
    pdfDocument: any,
    pagesToRender: Array<{ pageNumber: number; index: number }>,
    pageScale: number,
  ): Promise<string[]> {
    const pageImages: string[] = [];

    for (const pageInfo of pagesToRender) {
      try {
        // Get the page
        const page = await pdfDocument.getPage(pageInfo.pageNumber);
        const viewport = page.getViewport({ scale: pageScale });

        // Create a canvas to render the PDF page
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        await page.render({
          canvasContext: ctx,
          viewport: viewport,
        }).promise;

        // Add the page image to our array
        pageImages.push(canvas.toDataURL());
      } catch (pageError) {
        console.error(
          `Error rendering PDF page ${pageInfo.pageNumber}:`,
          pageError,
        );
        // Add a placeholder for failed pages
        pageImages.push(null);
      }
    }

    return pageImages;
  }

  // Handle drag-and-drop functionality
  updateAndExecute = async (localResourceId: string): Promise<void> => {
    this.setInputData(inputResourceIdSocketName, localResourceId);
    await this.loadPDFDocument(localResourceId); // First load the PDF
    await this.executeOptimizedChain();
  };

  public onNodeRemoved = (): void => {
    if (this.pdfDocument) {
      try {
        this.pdfDocument.destroy();
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.pdfDocument = null;
    }

    // Remove listener
    if (this.listenerId) {
      InterfaceController.removeListener(this.listenerId);
      this.listenerId = null;
    }
  };
}
