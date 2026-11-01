// A receipt capability lives only in this page's memory. No new persistence,
// carrier request, link generation, or customer information is introduced here.
let receiptShipmentGeneration = 0;
let receiptShipmentController = null;
function showReceiptShipment(sessionId) {
  const panel = document.getElementById('receiptShipment');
  const message = document.getElementById('receiptShipmentMessage');
  const refresh = document.getElementById('receiptShipmentRefresh');
  const hide = document.getElementById('receiptShipmentHide');
  if (!panel || !message || !refresh || !hide) return;
  receiptShipmentController?.abort();
  const generation = ++receiptShipmentGeneration;
  panel.hidden = false;
  message.textContent = 'Check whether Cambinos has recorded this paid order as handed to a carrier. This is not live carrier tracking.';
  refresh.disabled = false;
  refresh.onclick = async () => {
    receiptShipmentController?.abort();
    const controller = new AbortController(); receiptShipmentController = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    refresh.disabled = true; message.textContent = 'Checking shipment record…';
    try {
      const response = await fetch(`${API_ORIGIN}/api/storefront/checkout/shipment`, { method: 'POST', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) });
      const payload = await response.json();
      if (generation !== receiptShipmentGeneration || controller !== receiptShipmentController) return;
      if (!response.ok || !payload.success) throw Error('unavailable');
      const data = payload.data;
      if (data?.status === 'not_recorded') message.textContent = 'No shipment is recorded yet. Payment confirmation does not mean the order has shipped.';
      else if (data?.status === 'recorded_by_owner' && typeof data.carrier === 'string' && /^[A-Za-z0-9][A-Za-z0-9 .&()-]{1,59}$/.test(data.carrier) &&
          typeof data.trackingNumber === 'string' && /^[A-Za-z0-9][A-Za-z0-9 -]{3,79}$/.test(data.trackingNumber) &&
          typeof data.recordedAt === 'string' && Number.isFinite(Date.parse(data.recordedAt))) {
        message.textContent = `Recorded by Cambinos: ${data.carrier} · Tracking ${data.trackingNumber} · Recorded ${new Date(data.recordedAt).toLocaleString()}. This is not carrier-confirmed delivery. Check the carrier directly using this number.`;
      } else throw Error('invalid');
    } catch {
      if (generation === receiptShipmentGeneration && controller === receiptShipmentController) message.textContent = 'Shipment could not be checked. Retry, reopen your original paid checkout receipt, or contact support. No shipment or delivery status has been assumed.';
    } finally {
      clearTimeout(timeout);
      if (generation === receiptShipmentGeneration && controller === receiptShipmentController) refresh.disabled = false;
    }
  };
  hide.onclick = () => {
    ++receiptShipmentGeneration; receiptShipmentController?.abort(); receiptShipmentController = null;
    panel.hidden = true; message.textContent = ''; refresh.onclick = null; hide.onclick = null;
  };
}
