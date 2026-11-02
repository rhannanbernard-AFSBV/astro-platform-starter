from app.pos.events import format_sse


def test_format_sse_payload():
    body = format_sse({"type": "state", "revision": 3, "tenantId": "default"})
    assert body.startswith("event: pos\n")
    assert '"type":"state"' in body.replace(" ", "")
    assert body.endswith("\n\n")
