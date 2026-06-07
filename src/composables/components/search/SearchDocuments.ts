import { useElasticsearchAdapter } from '../../CallElasticsearch'
import { useSearchStore } from '../../../store/search'
import { useResizeStore } from '../../../store/resize'
import { Ref, ref, watch } from 'vue'
import { parseJson } from '../../../helpers/json/parse'
import { DEFAULT_SEARCH_QUERY_OBJ } from '../../../consts'
import { stringifyJson } from '../../../helpers/json/stringify.ts'
import { buildQueryFromTableOptions, getTableOptionsToApply } from '../../../helpers/search/searchQueryTableOptions'
import { paginationFromQuery } from '../../../helpers/search/paginationFromQuery'

export type EsSearchResult = {
  took: number | null
  hits: EsSearchResultHits
  aggregations?: Record<string, any>
}

type EsSearchResultHits = {
  total: EsSearchResultsHitsValues | number
  hits?: any
}

type EsSearchResultsHitsValues = {
  value: number
}

export const useSearchDocuments = () => {
  const { requestState, callElasticsearch } = useElasticsearchAdapter()

  const searchStore = useSearchStore()
  const resizeStore = useResizeStore()

  const searchResults: Ref<EsSearchResult> = ref({ took: null, hits: { total: { value: 0 } } })
  const queryParsingError = ref(false)
  const search = async () => {
    let query
    try {
      queryParsingError.value = false
      query = parseJson(searchStore.searchQuery)
    } catch (_e) {
      queryParsingError.value = true
      return
    }

    const pag = paginationFromQuery(query as Record<string, unknown>, searchStore.pagination.rowsPerPage)
    searchStore.pagination.page = pag.page
    searchStore.pagination.rowsPerPage = pag.rowsPerPage

    try {
      searchResults.value = await callElasticsearch('search', query, searchStore.indices)
      const total = searchResults.value.hits?.total
      searchStore.pagination.rowsNumber = typeof total === 'number' ? total : total.value
    } catch (e) {
      console.error(e)
      searchResults.value = { took: null, hits: { total: { value: 0 } } }
    }
  }

  watch(
    () => searchStore.indices,
    () => {
      searchStore.pagination.sortBy = ''
      try {
        mergeQuery(Object.assign({}, parseJson(searchStore.searchQuery), { sort: [] }))
      } catch (e) {
        console.error(e)
      }
    }
  )

  watch(
    () => searchStore.q,
    (value) => {
      mergeQuery({ query: { query_string: { query: value } } })
    }
  )

  // pagination = {sortBy: '', descending: false, page: 2, rowsPerPage: 10, rowsNumber: 2593}
  const onRequest = ({ pagination }: any) => {
    const query = parseJson(searchStore.searchQuery) as Record<string, unknown>
    const tableOptions = buildQueryFromTableOptions(pagination)
    const sortByChanged = pagination.sortBy !== searchStore.pagination.sortBy
    const toApply = sortByChanged ? tableOptions : getTableOptionsToApply(query, tableOptions, pagination)
    Object.assign(query, toApply)

    searchStore.pagination.page = pagination.page
    if ('sort' in toApply) {
      searchStore.pagination.sortBy = pagination.sortBy
      searchStore.pagination.descending = pagination.descending
    } else {
      searchStore.pagination.sortBy = ''
      searchStore.pagination.descending = false
    }

    searchStore.searchQuery = stringifyJson(query)
    search()
  }

  const mergeQuery = (params: any) => {
    const json = Object.assign({}, DEFAULT_SEARCH_QUERY_OBJ, params)
    searchStore.searchQuery = stringifyJson(json, null, '\t')
  }

  const editorCommands = [
    {
      key: 'Ctrl-Enter',
      run: () => {
        search()
        return true
      }
    },
    {
      key: 'Cmd-Enter',
      run: () => {
        search()
        return true
      }
    }
  ]

  return {
    search,
    searchResults,
    searchStore,
    resizeStore,
    queryParsingError,
    requestState,
    editorCommands,
    onRequest
  }
}

export { buildQueryFromTableOptions, getTableOptionsToApply } from '../../../helpers/search/searchQueryTableOptions'
