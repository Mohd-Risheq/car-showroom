import { type DecodeRequest, type Decoded, fetchAndDecode } from "../ui/fetch-decode";

// Decodes spin frames off the page's thread and hands each bitmap over without copying it.
// Messages: { id, request } decodes, { cancel: id } stops a request still in flight.

export type DecodeMessage = { id: number; request: DecodeRequest } | { cancel: number };
export type DecodeReply = { id: number; decoded: Decoded } | { id: number; error: string };

type Scope = {
  onmessage: ((event: MessageEvent<DecodeMessage>) => void) | null;
  postMessage(message: DecodeReply, transfer: Transferable[]): void;
};
const scope = self as unknown as Scope;
const inFlight = new Map<number, AbortController>();

scope.onmessage = async (event) => {
  const message = event.data;
  if ("cancel" in message) {
    inFlight.get(message.cancel)?.abort();
    inFlight.delete(message.cancel);
    return;
  }
  const controller = new AbortController();
  inFlight.set(message.id, controller);
  try {
    const decoded = await fetchAndDecode(message.request, controller.signal);
    if (controller.signal.aborted) {
      decoded.bitmap.close();
      return;
    }
    scope.postMessage({ id: message.id, decoded }, [decoded.bitmap]);
  } catch (error) {
    if (!controller.signal.aborted) scope.postMessage({ id: message.id, error: String(error) }, []);
  } finally {
    inFlight.delete(message.id);
  }
};
