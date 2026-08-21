from enum import IntEnum


class AnkiCardType(IntEnum):
    NEW = 0
    LEARNING = 1
    REVIEW = 2
    RELEARNING = 3


class AnkiCardQueue(IntEnum):
    USER_BURIED = -3
    SIBLING_BURIED = -2
    SUSPENDED = -1
    NEW = 0
    LEARNING = 1
    REVIEW = 2
    DAY_LEARN = 3
    PREVIEW = 4


class AnkiRevlogType(IntEnum):
    LEARN = 0
    REVIEW = 1
    RELEARN = 2
    FILTERED = 3
    MANUAL = 4
