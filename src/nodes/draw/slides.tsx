import React, { useEffect, useRef, useState } from 'react';
import { TRgba } from '../../utils/color';
import { Box, BoxProps } from '@mui/material';
import { ErrorBoundary } from 'react-error-boundary';
import ErrorFallback from '../../components/ErrorFallback';
import PPNode from '../../classes/NodeClass';
import PPSocket from '../../classes/SocketClass';
import UpdateBehaviourClass from '../../classes/UpdateBehaviourClass';
import InterfaceController, { ListenEvent } from '../../InterfaceController';
import { CodeType } from '../datatypes/codeType';
import { EnumStructure, EnumType } from '../datatypes/enumType';
import { TriggerType } from '../datatypes/triggerType';
import { DynamicImport } from '../../utils/dynamicImport';
import { TNodeSource } from '../../utils/interfaces';
import {
  getCanvasWidgetPointerEvents,
  getWidgetPointerEvents,
} from '../../utils/nodeInteractivity';
import { wrapDownloadLink } from '../../utils/utils';
import {
  NODE_TYPE_COLOR,
  SOCKET_TYPE,
  TRIGGER_TYPE_OPTIONS,
} from '../../utils/constants';
import HybridNode2 from '../../classes/HybridNode2';

const VERSION = '5.1.0';
const IMPORT_NAME = 'reveal.js@' + VERSION;
const BASEURL = `https://cdn.jsdelivr.net/npm/${IMPORT_NAME}/dist`;
const CSS_REVEAL = `${BASEURL}/reveal.min.css`;
const themesOptions: EnumStructure = [
  { text: 'black' },
  { text: 'white' },
  { text: 'league' },
  { text: 'beige' },
  { text: 'night' },
  { text: 'serif' },
  { text: 'simple' },
  { text: 'solarized' },
  { text: 'moon' },
  { text: 'dracula' },
  { text: 'sky' },
  { text: 'blood' },
];

const inputSocketNameData = 'Data';
const themesSocketName = 'Theme';
const prevSocketName = 'Previous';
const nextSocketName = 'Next';

export class Slideshow extends HybridNode2 {
  eventTarget: EventTarget;
  revealModule;

  public onNodeAdded = async (source: TNodeSource): Promise<void> => {
    this.eventTarget = new EventTarget();
    await super.onNodeAdded(source);

    this.revealModule = await DynamicImport.dynamicImport(IMPORT_NAME);
    this.eventTarget.dispatchEvent(new Event('moduleLoaded'));
  };

  public getName(): string {
    return 'Slideshow generator';
  }

  public getDescription(): string {
    return 'Create powerpoint presentations using markup';
  }

  public getAdditionalDescription(): string {
    return `<p>This node uses the ${wrapDownloadLink(
      'https://revealjs.com/',
      'reveal.js',
    )} library. Check out its documentation for more details.</p>`;
  }

  public getTags(): string[] {
    return ['Input'].concat(super.getTags());
  }

  public getMinNodeWidth(): number {
    return 200;
  }

  public getMinNodeHeight(): number {
    return 200;
  }

  public getDefaultNodeWidth(): number {
    return 640;
  }

  public getDefaultNodeHeight(): number {
    return 360;
  }

  public getDynamicImports(): string[] {
    return [IMPORT_NAME];
  }

  getShowLabels(): boolean {
    return false;
  }

  getOpacity(): number {
    return 0.001;
  }

  getPreferredInputSocketName(): string {
    return inputSocketNameData;
  }

  getColor(): TRgba {
    return TRgba.fromString(NODE_TYPE_COLOR.OUTPUT);
  }

  getDefaultData(): string {
    return `<section>
  <h1>Slideshow example</h1>
  <p>Update content via Data input</p>
</section>

<section>
  <h2>Shortcuts</h2>
  <p>(when in user interface)</p>
  <ul>
    <li>Next slide: <strong>Space, →, ↓</strong></li>
    <li>Previous slide: <strong>←, ↑</strong></li>
    <li>Fullscreen: <strong>F</strong></li>
    <li>Overview mode: <strong>Esc</strong></li>
  </ul>
</section>

<section>
  <h2>Basic Slide</h2>
  <p>This is a basic slide with text.</p>
  <p>Use &lt;section&gt; tags for each slide.</p>
</section>

<section>
  <section>
    <h2>Nested Slides</h2>
    <p>This slide has nested vertical slides.</p>
  </section>
  <section>
    <h3>Nested Slide 1</h3>
    <p>Use nested &lt;section&gt; tags for vertical slides.</p>
  </section>
  <section>
    <h3>Nested Slide 2</h3>
    <p>Navigate with down arrow or swipe down.</p>
  </section>
</section>

<section data-background="#007acc">
  <h2>Custom Background</h2>
  <p>Use data-background attribute to set slide background.</p>
</section>

<section>
  <h2>Fragments</h2>
  <p class="fragment">This text will appear on click.</p>
  <p class="fragment">This text will appear next.</p>
</section>

<section>
  <h2>Code Highlighting</h2>
  <pre><code data-trim data-noescape class="language-javascript">
      let greeting = "Hello, World!";
      console.log(greeting);
  </code></pre>
</section>

<section data-background-image="https://picsum.photos/600/300">
  <h2>Image Background</h2>
  <p>Use data-background-image for image backgrounds.</p>
</section>

<section>
  <h2>Thank You!</h2>
  <p>More options available at <a href="https://revealjs.com">revealjs.com</a></p>
</section>`;
  }

  public getUpdateBehaviour(): UpdateBehaviourClass {
    return new UpdateBehaviourClass(true, true, false, 1000, this);
  }

  protected getDefaultIO(): PPSocket[] {
    return [
      new PPSocket(
        SOCKET_TYPE.IN,
        inputSocketNameData,
        new CodeType(),
        this.getDefaultData(),
        true,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        themesSocketName,
        new EnumType(themesOptions, undefined, true),
        themesOptions[0].text,
        false,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        prevSocketName,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'prev'),
        0,
        true,
      ),
      new PPSocket(
        SOCKET_TYPE.IN,
        nextSocketName,
        new TriggerType(TRIGGER_TYPE_OPTIONS[0].text, 'next'),
        0,
        true,
      ),
    ];
  }

  next = async () => {
    this.eventTarget.dispatchEvent(new Event('next'));
  };

  prev = async () => {
    this.eventTarget.dispatchEvent(new Event('prev'));
  };

  onNodeResize = (newWidth, newHeight) => {
    this.eventTarget.dispatchEvent(new Event('nodeResize'));
  };

  // small presentational component
  getWidgetContent(props: any): React.ReactElement {
    return <MyFunctionalComponent {...props} />;
  }
}

const initializing: string = `<section>
  <h1>Initializing slides</h1>
</section>`;

const invalidData: string = `<section>
  <h1>Invalid data</h1>
</section>`;

const MyFunctionalComponent = ({
  node,
  inDashboard = false,
  showDashboard = false,
  ...props
}) => {
  const [data, setData] = useState(initializing);
  const [initialized, setInitialized] = useState(false);
  const deckDivRef = useRef(null);
  const deckRef = useRef(null);
  const revealCssLinkId = `reveal-css-${node.id}`;
  const themeLinkId = `reveal-theme-${node.id}`;

  const handleNext = () => deckRef.current?.next();
  const handlePrev = () => deckRef.current?.prev();

  const safeDestroyDeck = () => {
    if (!deckRef.current) {
      return;
    }
    // reveal.js throws internally when destroy() runs before initialize()
    // has finished (e.g. the widget re-renders right after mounting), which
    // would otherwise crash the whole app via the error boundary
    try {
      deckRef.current.destroy();
    } catch (error) {
      console.warn('reveal.js destroy error:', error);
    }
    deckRef.current = null;
  };

  const handleNodeResize = () => {
    if (!deckRef.current) return;

    // In some cases reveal.js throws an internal error, which is caught here to prevent the app from crashing
    // This internal error is usually resolved when the content is fixed/changed
    try {
      const currPosition = deckRef.current.getIndices();
      deckRef.current.layout();
      deckRef.current.sync();
      deckRef.current.slide(currPosition.h, currPosition.v, currPosition.f);
    } catch (error) {
      console.warn('reveal.js internal error:', error);
    }
  };

  const handleModuleLoaded = () => {
    if (!node.revealModule || !deckDivRef.current || deckRef.current) return;

    const initializeReveal = async () => {
      try {
        deckRef.current = new node.revealModule.default(deckDivRef.current, {
          embedded: true,
          keyboardCondition: 'focused',
          transition: 'slide',
          scrollActivationWidth: null,
          // slideNumber: true,
        });

        await deckRef.current.initialize();
        setInitialized(true);
      } catch (error) {
        console.error(
          `${node.id} (${inDashboard}): failed to initialize reveal.js`,
          error,
        );
      }
    };

    void initializeReveal();
  };

  useEffect(() => {
    const resizeObserver = new ResizeObserver((entries) => {
      const width = entries[0].contentRect.width;
      if (width > 0 && deckRef.current) {
        handleNodeResize();
      }
    });

    if (deckDivRef.current) {
      resizeObserver.observe(deckDivRef.current);
    }

    node.eventTarget.addEventListener('next', handleNext);
    node.eventTarget.addEventListener('prev', handlePrev);
    node.eventTarget.addEventListener('nodeResize', handleNodeResize);
    node.eventTarget.addEventListener('moduleLoaded', handleModuleLoaded);

    return () => {
      resizeObserver.disconnect();
      node.eventTarget.removeEventListener('next', handleNext);
      node.eventTarget.removeEventListener('prev', handlePrev);
      node.eventTarget.removeEventListener('nodeResize', handleNodeResize);
      node.eventTarget.removeEventListener('moduleLoaded', handleModuleLoaded);

      safeDestroyDeck();
    };
  }, []);

  useEffect(() => {
    // deckDivRef changed so reveal.js needs to be initialized again
    if (initialized) {
      safeDestroyDeck();
    }
    setInitialized(false);
    handleModuleLoaded();
  }, [deckDivRef.current]);

  useEffect(() => {
    const revealCssLink = document.getElementById(revealCssLinkId);
    if (!revealCssLink) {
      console.error('Reveal CSS link not found');
      return;
    }

    let themeLink = document.getElementById(
      themeLinkId,
    ) as HTMLLinkElement | null;

    if (!themeLink) {
      themeLink = document.createElement('link');
      themeLink.id = themeLinkId;
      themeLink.rel = 'stylesheet';
      revealCssLink.insertAdjacentElement('afterend', themeLink);
    }

    if (props[themesSocketName]) {
      themeLink.href = `${BASEURL}/theme/${props[themesSocketName]}.min.css`;
    }
  }, [props[themesSocketName]]);

  useEffect(() => {
    if (!initialized) return;

    if (props[inputSocketNameData]) {
      setData(props[inputSocketNameData]);
    } else {
      setData(invalidData);
    }

    setTimeout(() => {
      handleNodeResize();
    }, 100);
  }, [initialized, props[inputSocketNameData]]);

  // for slides on a hidden dashboard remove interaction
  // else inject css variable for the arrow controls as they get lost (reveal.js bug?)
  const controlStylesOverrides: BoxProps['sx'] =
    inDashboard && !showDashboard
      ? { pointerEvents: 'none' }
      : {
          '--r-controls-spacing': '0.8em' as const,
          pointerEvents: getCanvasWidgetPointerEvents(props),
        };

  // specifically remove interaction for sections
  const sectionStylesOverrides: BoxProps['sx'] = {
    pointerEvents: getCanvasWidgetPointerEvents(props),
  };

  // and again specifically for sections of slides on a hidden dashboard
  // override interaction and visibility with higher specificity (&&&&)
  if (inDashboard && !showDashboard) {
    sectionStylesOverrides.visibility = 'hidden';
    sectionStylesOverrides.pointerEvents = 'none';
  }

  // specifically remove interaction for sections
  const backgroundStylesOverrides: BoxProps['sx'] =
    inDashboard && !showDashboard ? { visibility: 'hidden' } : {};

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, info) => {
        console.error(
          `Error occurred ${inDashboard ? 'in dashboard' : 'in canvas'}:`,
          error,
          info,
        );
      }}
    >
      <link id={revealCssLinkId} rel="stylesheet" href={CSS_REVEAL} />
      <Box
        className="reveal"
        ref={deckDivRef}
        sx={{
          position: 'relative',
          height: '100%',
          width: '100%',
          ...controlStylesOverrides,
          '&&& section': sectionStylesOverrides,
          '&&& .slide-background.present': backgroundStylesOverrides,
        }}
      >
        <Box className="slides" dangerouslySetInnerHTML={{ __html: data }} />
      </Box>
    </ErrorBoundary>
  );
};
