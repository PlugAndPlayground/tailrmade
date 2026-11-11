import PPGraph from '../classes/GraphClass';
import InterfaceController from '../InterfaceController';
import { getAppLink } from './cloudGraphURL';
import { parseShareLink, shareContent, ShareContent } from './share';

// Runs from a share link's click handler; nothing here may await before
// shareContent, or the browser drops the click's user activation.
export function openShareLink(href: string): void {
  const link = parseShareLink(href);
  if (!link) return;
  let content: ShareContent;
  if (link.kind === 'app') {
    const graph = PPGraph.currentGraph;
    const url = getAppLink(graph);
    if (!url) {
      InterfaceController.showSnackBar(
        'This app has no public link to share yet.',
        { variant: 'warning' },
      );
      return;
    }
    content = { title: link.title ?? graph.name, text: link.text, url };
  } else {
    content = link.content;
  }
  void shareContent(content).then((result) => {
    if (result === 'copied') InterfaceController.showSnackBar('Copied');
  });
}
