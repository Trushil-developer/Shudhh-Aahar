if(NOT TARGET hermes-engine::libhermes)
add_library(hermes-engine::libhermes SHARED IMPORTED)
set_target_properties(hermes-engine::libhermes PROPERTIES
    IMPORTED_LOCATION "/Users/trushil/.gradle/caches/8.10.2/transforms/d549dabe41054dcc3e2b9a87b95661ac/transformed/hermes-android-0.76.0-debug/prefab/modules/libhermes/libs/android.x86_64/libhermes.so"
    INTERFACE_INCLUDE_DIRECTORIES "/Users/trushil/.gradle/caches/8.10.2/transforms/d549dabe41054dcc3e2b9a87b95661ac/transformed/hermes-android-0.76.0-debug/prefab/modules/libhermes/include"
    INTERFACE_LINK_LIBRARIES ""
)
endif()

