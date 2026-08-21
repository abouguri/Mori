from app.importer.sanitize import sanitize_template


def test_strips_script_tags() -> None:
    assert sanitize_template("{{Front}}<script>alert(1)</script>") == "{{Front}}"


def test_strips_inline_event_handlers() -> None:
    result = sanitize_template('<div onclick="evil()">{{Front}}</div>')
    assert "onclick" not in result
    assert "{{Front}}" in result


def test_strips_javascript_urls() -> None:
    result = sanitize_template('<a href="javascript:alert(1)">click</a>')
    assert "javascript:" not in result


def test_preserves_legitimate_media_and_styling() -> None:
    result = sanitize_template('<div style="color:red"><img src="cat.jpg" class="pic"></div>')
    assert 'src="cat.jpg"' in result
    assert 'style="color:red"' in result
    assert 'class="pic"' in result


def test_preserves_field_placeholders_untouched() -> None:
    template = "{{FrontSide}}<hr>{{cloze:Text}}"
    assert sanitize_template(template) == template
