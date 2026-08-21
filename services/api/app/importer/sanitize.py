import nh3

# Card templates are untrusted user content that may carry <script>, inline
# event handlers, or javascript: URLs (§07.4, §09.4). This is a strict
# allow-list, not a denylist — anything not named here is stripped.
_ALLOWED_TAGS = {
    "div", "span", "br", "hr", "p",
    "b", "i", "u", "strong", "em", "small", "sub", "sup", "s", "mark",
    "ul", "ol", "li",
    "table", "thead", "tbody", "tr", "td", "th",
    "img", "audio", "video", "source",
    "a",
}  # fmt: skip

_ALLOWED_ATTRIBUTES = {
    "*": {"class", "style", "id"},
    "img": {"src", "alt", "width", "height"},
    "audio": {"src", "controls", "autoplay"},
    "video": {"src", "controls", "width", "height"},
    "source": {"src", "type"},
    "a": {"href", "title"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan"},
}

# Blocks javascript:/data: hrefs; relative and bare filenames (Anki's own
# media references, e.g. src="cat.jpg") aren't scheme-prefixed and pass
# through untouched.
_ALLOWED_URL_SCHEMES = {"http", "https"}


def sanitize_template(html: str) -> str:
    return nh3.clean(
        html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRIBUTES,
        url_schemes=_ALLOWED_URL_SCHEMES,
        link_rel=None,
    )
