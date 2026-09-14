//! Regression coverage for RUSTSEC-2024-0429 against Nexora's exact GLib backport.
//! Run with `cargo test --locked --release`; the original FFI bug is optimization-sensitive.

#[cfg(test)]
mod tests {
    use glib::{prelude::*, Variant};

    fn strings(values: &[&str]) -> Variant {
        Variant::array_from_iter::<String>(values.iter().map(|value| value.to_variant()))
    }

    #[test]
    fn next_returns_borrowed_strings_and_tracks_length() {
        let values = strings(&["first", "second", "third"]);
        let mut iter = values.array_iter_str().unwrap();
        assert_eq!(iter.len(), 3);
        assert_eq!(iter.size_hint(), (3, Some(3)));
        assert_eq!(iter.next(), Some("first"));
        assert_eq!(iter.len(), 2);
        assert_eq!(iter.next(), Some("second"));
        assert_eq!(iter.next(), Some("third"));
        assert_eq!(iter.next(), None);
        assert_eq!(iter.size_hint(), (0, Some(0)));
    }

    #[test]
    fn preserves_unicode_and_empty_strings() {
        let expected = ["", "Español: áéíóú", "日本語", "🦀🌙", "e\u{301}"];
        let values = strings(&expected);
        assert_eq!(
            values.array_iter_str().unwrap().collect::<Vec<_>>(),
            expected
        );
    }

    #[test]
    fn next_back_returns_reverse_order() {
        let values = strings(&["uno", "dos", "tres"]);
        let mut iter = values.array_iter_str().unwrap();
        assert_eq!(iter.next_back(), Some("tres"));
        assert_eq!(iter.next_back(), Some("dos"));
        assert_eq!(iter.next_back(), Some("uno"));
        assert_eq!(iter.next_back(), None);
    }

    #[test]
    fn nth_skips_and_exhausts_safely() {
        let values = strings(&["a", "b", "c", "d"]);
        let mut iter = values.array_iter_str().unwrap();
        assert_eq!(iter.nth(1), Some("b"));
        assert_eq!(iter.next(), Some("c"));
        assert_eq!(iter.nth(usize::MAX), None);
        assert_eq!(iter.next_back(), None);
        assert_eq!(iter.len(), 0);
    }

    #[test]
    fn nth_back_skips_and_exhausts_safely() {
        let values = strings(&["a", "b", "c", "d"]);
        let mut iter = values.array_iter_str().unwrap();
        assert_eq!(iter.nth_back(1), Some("c"));
        assert_eq!(iter.next_back(), Some("b"));
        assert_eq!(iter.nth_back(usize::MAX), None);
        assert_eq!(iter.next(), None);
        assert_eq!(iter.len(), 0);
    }

    #[test]
    fn last_respects_remaining_range() {
        let values = strings(&["a", "b", "c", "d"]);
        let mut iter = values.array_iter_str().unwrap();
        assert_eq!(iter.next(), Some("a"));
        assert_eq!(iter.next_back(), Some("d"));
        assert_eq!(iter.last(), Some("c"));
    }

    #[test]
    fn mixed_iteration_never_repeats_or_crosses_boundaries() {
        let values = strings(&["a", "b", "c", "d", "e", "f"]);
        let mut iter = values.array_iter_str().unwrap();
        assert_eq!(iter.next(), Some("a"));
        assert_eq!(iter.next_back(), Some("f"));
        assert_eq!(iter.nth(1), Some("c"));
        assert_eq!(iter.next_back(), Some("e"));
        assert_eq!(iter.next(), Some("d"));
        assert_eq!(iter.next_back(), None);
        assert_eq!(iter.next(), None);
        assert_eq!(iter.len(), 0);
    }

    #[test]
    fn empty_and_exhausted_iterators_remain_fused() {
        let values = strings(&[]);
        let mut iter = values.array_iter_str().unwrap();
        assert_eq!(iter.next(), None);
        assert_eq!(iter.next_back(), None);
        assert_eq!(iter.nth(4), None);
        assert_eq!(iter.nth_back(4), None);
        assert_eq!(iter.len(), 0);
        assert_eq!(iter.last(), None);
    }

    #[test]
    fn rejects_a_non_string_array() {
        let values = Variant::array_from_iter::<u32>([1u32.to_variant(), 2u32.to_variant()]);
        assert!(values.array_iter_str().is_err());
    }
}
