"""Fast contract tests: no Ollama, Qdrant, or Mem0 installation required."""
import sys
import unittest
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import CuratedIndex, NAMESPACE, extract_rows, sqlite_id


class FakeMem0:
    def __init__(self):
        self.data = {}
        self.count = 0
        self.calls = []
    def get_all(self, *, filters, top_k):
        assert filters == {"user_id": NAMESPACE}
        self.calls.append("list")
        return {"results": list(self.data.values())}
    def add(self, fact, *, user_id, infer, metadata):
        assert user_id == NAMESPACE and infer is False
        self.count += 1
        ident = "mem-" + str(self.count)
        self.data[ident] = {"id": ident, "memory": fact, "metadata": metadata}
        self.calls.append("add")
        return {"results": [{"id": ident, "memory": fact, "event": "ADD"}]}
    def update(self, ident, *, text):
        self.data[ident]["memory"] = text
        self.calls.append("update")
    def delete(self, ident):
        del self.data[ident]
        self.calls.append("delete")
    def search(self, text, *, filters, top_k):
        assert filters == {"user_id": NAMESPACE}
        self.calls.append("search")
        # Simulates an embedding mapping "website" to professional dev skills,
        # even without any shared keywords.
        matched = [x for x in self.data.values() if
                   ("website" in text.lower() and "WordPress" in x["memory"]) or
                   "hobby" in text.lower() and "guitar" in x["memory"]]
        return {"results": [{"id": x["id"], "metadata": x["metadata"],
                             "memory": x["memory"], "score": 0.78}
                            for x in matched]}


class IndexTests(unittest.TestCase):
    def setUp(self):
        self.mem0 = FakeMem0()
        self.index = CuratedIndex(self.mem0)
        self.user = [
            {"id": 7, "fact": "The user is an experienced WordPress developer."},
            {"id": 9, "fact": "The user plays guitar and writes metal music."}
        ]

    def recall(self, question, facts):
        self.index.recall(question, facts)
        for _ in range(200):
            with self.index.mutex:
                if not self.index.syncing:
                    break
            time.sleep(0.005)
        return self.index.recall(question, facts)

    def test_semantic_recall_uses_real_mem0_index_and_returns_authoritative_sqlite_fact(self):
        matched = self.recall("Help me build a website", self.user)
        self.assertEqual(matched[0]["id"], 7)
        self.assertIn("WordPress developer", matched[0]["fact"])
        self.assertEqual(self.mem0.calls.count("add"), 2)
        self.recall("Help me build a website", self.user)
        self.assertEqual(self.mem0.calls.count("add"), 2)
        self.assertEqual(self.mem0.calls.count("list"), 1)

    def test_edits_are_updated_and_deleted_facts_are_purged_without_touching_archive(self):
        self.recall("hobby", self.user)
        next_version = [{"id": 7, "fact": "The user is learning Rust."}]
        self.recall("build a website", next_version)
        self.assertIn("update", self.mem0.calls)
        self.assertIn("delete", self.mem0.calls)
        self.assertEqual(len(self.mem0.data), 1)
        self.assertEqual(next(iter(self.mem0.data.values()))["memory"],
                         "The user is learning Rust.")

    def test_index_results_cannot_invent_unstored_memories(self):
        self.recall("build a website", self.user)
        self.mem0.data["fake"] = {
            "id": "fake", "memory": "The user is a neurosurgeon.",
            "metadata": {"sqlite_id": "123"}
        }
        # checksum unchanged so this tests filtering of a stale/untrusted
        # vector response rather than simply deleting before retrieval.
        self.mem0.search = lambda *args, **kwargs: {"results": [
            self.mem0.data["fake"], *list(self.mem0.data.values())]}
        result = self.recall("build a website", self.user)
        self.assertNotIn(123, [row["id"] for row in result])

    def test_empty_facts_delete_stale_index_and_return_no_results(self):
        self.recall("website", self.user)
        self.assertEqual(self.recall("website", []), [])
        self.assertEqual(len(self.mem0.data), 0)

    def test_unrelated_or_malformed_input_is_rejected(self):
        for bad in ([{"id": True, "fact": "abc"}], [{"id": -1, "fact": "abc"}],
                    [{"id": 2, "fact": ""}], "not a list"):
            with self.assertRaises(ValueError):
                self.recall("question", bad)
        with self.assertRaises(ValueError):
            self.recall("q" * 1001, self.user)

    def test_categories_and_tags_are_indexed_but_returned_facts_are_unmodified(self):
        source=[{"id": 3, "fact": "The user has creative hobbies", "category":"interests",
                 "tags":["guitar","music"]}]
        self.recall("hobby", source)
        stored=next(iter(self.mem0.data.values()))["memory"]
        self.assertIn("Category: interests", stored)
        self.assertIn("Tags: guitar, music", stored)
        self.assertEqual(self.recall("hobby", source)[0]["fact"],source[0]["fact"])

    def test_mem0_results_contract_and_metadata_fields(self):
        self.assertEqual(extract_rows({"results":[{"id":"a"},None,3]}),[{"id":"a"}])
        self.assertIsNone(sqlite_id({"metadata":{"sqlite_id":"invalid"}}))
        self.assertEqual(sqlite_id({"sqlite_id":"8"}),8)


if __name__ == "__main__":
    unittest.main()
