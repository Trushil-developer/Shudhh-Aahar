if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "/Users/trushil/.gradle/caches/8.10.2/transforms/5e195fd18cfade53f4b8d2b5ecf92bf0/transformed/hermes-android-0.76.0-release/prefab/modules/libhermes/libs/android.arm64-v8a/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/trushil/.gradle/caches/8.10.2/transforms/5e195fd18cfade53f4b8d2b5ecf92bf0/transformed/hermes-android-0.76.0-release/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

