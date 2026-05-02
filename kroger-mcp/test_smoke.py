import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient


SERVICE_DIR = Path(__file__).resolve().parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

import app as kroger_app  # noqa: E402


class KrogerMcpSmokeTest(unittest.TestCase):
    def setUp(self) -> None:
        os.environ["KROGER_CLIENT_ID"] = "demo-client"
        os.environ["KROGER_CLIENT_SECRET"] = "demo-secret"
        os.environ["KROGER_REDIRECT_URI"] = "http://localhost:3000/auth/kroger/callback"
        self.client = TestClient(kroger_app.app)

    def test_auth_start_returns_shape(self) -> None:
        response = self.client.post("/auth/start", headers={"X-CraveCart-Session": "test-session"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertIn("authUrl", payload)
        self.assertIn("state=", payload["authUrl"])

    def test_cart_add_aggregates_item_results(self) -> None:
        fake_token = {"access_token": "abc", "expires_at": 9999999999}

        def fake_add(access_token, item):
            if item.upc == "bad":
                raise kroger_app.requests.RequestException("bad item")
            return None

        with patch.object(kroger_app, "get_user_token", return_value=fake_token), patch.object(
            kroger_app, "add_single_item_to_cart", side_effect=fake_add
        ):
            payload = kroger_app.add_kroger_items_to_cart(
                session_id="test-session",
                items=[
                    {"upc": "good", "quantity": 1, "modality": "PICKUP"},
                    {"upc": "bad", "quantity": 1, "modality": "PICKUP"},
                ],
            )

        self.assertTrue(payload["authenticated"])
        self.assertEqual(len(payload["results"]), 2)
        self.assertTrue(payload["results"][0]["success"])
        self.assertFalse(payload["results"][1]["success"])


if __name__ == "__main__":
    unittest.main()
