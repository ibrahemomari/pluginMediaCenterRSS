'use strict';

(function (angular) {
    angular
        .module('mediaCenterRSSPluginWidget')
        .controller('WidgetHomeCtrl', ['$scope', 'DataStore', 'Buildfire', 'FeedParseService', 'TAG_NAMES', 'ItemDetailsService', 'Location', '$filter', 'Underscore', '$rootScope', 'FEED_IMAGES',
            function ($scope, DataStore, Buildfire, FeedParseService, TAG_NAMES, ItemDetailsService, Location, $filter, Underscore, $rootScope, FEED_IMAGES) {

                if (window.device) {
                    if (window.device.platform === 'Android') {
                        $rootScope.deviceHeight = window.outerHeight;
                        $rootScope.deviceWidth = window.outerWidth;
                    } else {
                        $rootScope.deviceHeight = window.innerHeight;
                        $rootScope.deviceWidth = window.innerWidth || 320;
                    }
                } else {
                    $rootScope.deviceHeight = window.innerHeight;
                    $rootScope.deviceWidth = window.innerWidth || 320;
                }

                $scope.first = true;
                /**
                 * @name handleBookmarkNav
                 * @type {function}
                 * Handles incoming bookmark navigation
                 */
                var handleBookmarkNav = function handleBookmarkNav() {
                    if ($scope.first) {
                        buildfire.deeplink.getData(function (data) {
                            if (data && data.link) {
                                var targetGuid = data.link;
                                var itemLinks = _items.map(function (item) {
                                    return item.guid
                                });
                                var index = itemLinks.indexOf(targetGuid);
                                if (index < 0) {
                                    console.warn('bookmarked item not found.');
                                } else {
                                    if (data.timeIndex) {
                                        _items[index].seekTo = data.timeIndex;
                                    }
                                    $rootScope.deeplinkFirstNav = true;
                                    WidgetHome.goToItem(index, _items[index]);
                                }
                                $scope.first = false;
                                if (!$scope.$$phase) $scope.$apply();
                            }
                        });
                    }
                };

                /** 
                 * Private variables
                 *
                 * @name _items used to hold RSS feed items and helps in lazy loading.
                 * @type {object} 
                 * @private 
                 *
                 * @name limit used to load a number of items in list on scroll
                 * @type {number}
                 * @private
                 *
                 * @name chunkData used to hold chunks of _items.
                 * @type {object}
                 * @private
                 *
                 * @name nextChunkDataIndex used to hold index of next chunk.
                 * @type {number}
                 * @private
                 *
                 * @name nextChunk used to hold chunk based on nextChunkDataIndex token.
                 * @type {object}
                 * @private
                 *
                 * @name totalChunks used to hold number of available chunks i.e. chunkData.length.
                 * @type {number}
                 * @private
                 *
                 * @name currentRssUrl used to hold previously saved rss url.
                 * @type {string}
                 * @private
                 *
                 *  */
                var view = null,
                    _items = [],
                    limit = 50,
                    chunkData = null,
                    nextChunkDataIndex = 0,
                    nextChunk = null,
                    totalChunks = 0,
                    currentRssUrl = null,
                    WidgetHome = this,
                    isInit = true;

                var _data = {
                    "content": {
                        "carouselImages": [],
                        "description": "",
                        "rssUrl": "https://blog.ted.com/feed"
                    },
                    "design": {
                        "itemListLayout": 'List_Layout_1',
                        "itemDetailsLayout": 'Feed_Layout_1',
                        "itemListBgImage": "",
                        "itemDetailsBgImage": ""
                    }
                };

                /** 
                 * @name WidgetHome.data is used to hold user's data object which used throughout the app.
                 * @type {object}
                 */
                WidgetHome.data = null;
                WidgetHome.view = null;

                /**
                 * @name WidgetHome.items is used to listing items.
                 * @type {object}
                 */
                WidgetHome.items = [];

                /** 
                 * @name WidgetHome.busy is used to disable ng-infinite scroll when more data not available to show.
                 * @type {boolean}
                 */
                WidgetHome.busy = false;

                /**
                 * @name WidgetHome.isItems is used to show info message when _items.length == 0.
                 * @type {boolean}
                 */
                WidgetHome.isItems = true;

                $rootScope.showFeed = true;

                /**
                 * @name resetDefaults()
                 * Used to reset default values
                 * @private
                 */
                var resetDefaults = function () {
                    chunkData = null;
                    nextChunkDataIndex = 0;
                    nextChunk = null;
                    totalChunks = 0;
                    _items = [];
                    WidgetHome.items = [];
                    WidgetHome.busy = false;
                    WidgetHome.isItems = true;
                    if(!$rootScope.preventResetDefaults) {
                        ItemDetailsService.setData(null);
                    }
                };

                /**
                 * @name getImageUrl()
                 * Used to extract image url
                 * @param item
                 * @returns {*}
                 */
                var getImageUrl = function (item) {
                    var i = 0,
                        length = 0,
                        imageUrl = '';
                    if (item.image && item.image.url) {
                        return item.image.url;
                    } else if (item.enclosures && item.enclosures.length > 0) {
                        length = item.enclosures.length;
                        for (i = 0; i < length; i++) {
                            if (item.enclosures[i].type.indexOf('image') === 0) {
                                imageUrl = item.enclosures[i].url;
                                break;
                            }
                        }
                        return imageUrl;
                    } else {
                        if (item['media:thumbnail'] && item['media:thumbnail']['@'] && item['media:thumbnail']['@'].url) {
                            return item['media:thumbnail']['@'].url;
                        } else if (item['media:group'] && item['media:group']['media:content'] && item['media:group']['media:content']['media:thumbnail'] && item['media:group']['media:content']['media:thumbnail']['@'] && item['media:group']['media:content']['media:thumbnail']['@'].url) {
                            return item['media:group']['media:content']['media:thumbnail']['@'].url;
                        } else if (item.description) {
                            return $filter('extractImgSrc')(item.description);
                        } else {
                            return '';
                        }
                    }
                };

                /**
                 * @name getFeedData()
                 * @private
                 * used to fetch RSS feed Data object if a valid RSS feed url provided
                 * @param rssUrl
                 */
                var getFeedData = function (rssUrl) {
                    resetDefaults();
                    Buildfire.spinner.show();
                    FeedParseService.getFeedData(rssUrl).then(getFeedDataSuccess, getFeedDataError);
                };
                var getFeedDataSuccess = function (result) {
                    // compare the first item, last item, and length of the cached feed vs fetched feed

                    var isUnchanged = checkFeedEquality(_items, result.data.items);
                    console.warn(isUnchanged);
                    
                    result.rssUrl = WidgetHome.data.content.rssUrl ? WidgetHome.data.content.rssUrl : false;
                    cache.saveCache(result);
                    if (isUnchanged) return;

                    if (WidgetHome.items.length > 0) {
                        WidgetHome.items = [];
                        _items = [];
                        nextChunkDataIndex = 0;
                    }
                    if (result.data && result.data.items.length > 0) {
                        result.data.items.forEach(function (item) {
                            item.imageSrcUrl = getImageUrl(item);
                        });
                        _items = result.data.items;
                        WidgetHome.isItems = true;
                        $scope.hideandshow = true;
                    } else {
                        WidgetHome.isItems = false;
                    }
                    chunkData = Underscore.chunk(_items, limit);
                    totalChunks = chunkData.length;
                    WidgetHome.loadMore();

                    viewedItems.sync(WidgetHome.items);
                    bookmarks.sync($scope);
                    handleBookmarkNav();

                    isInit = false;

                    function checkFeedEquality(currentItems, fetchedItems) {
                        
                        if (!currentItems[0] || !currentItems[0].guid) return false;

                        var sameLength = currentItems.length === fetchedItems.length;
                        var firstItemUnchanged = currentItems[0].guid === fetchedItems[0].guid;
                        var lastItemUnchanged = currentItems[currentItems.length - 1].guid === fetchedItems[fetchedItems.length - 1].guid;
    
                        return sameLength && firstItemUnchanged && lastItemUnchanged;
                    }
                };

                var getFeedDataError = function (err) {
                    Buildfire.spinner.hide();
                    console.error('Error while getting feed data', err);
                };


                /**
                 * @name onUpdateCallback()
                 * @private
                 * Will be called when DataStore.onUpdate() have been made.
                 * @param event
                 */
                var onUpdateCallback = function (event) {
                    if (event && event.tag === TAG_NAMES.RSS_FEED_INFO) {
                        WidgetHome.data = event.data;
                        $rootScope.data = event.data;
                        $rootScope.backgroundImage = WidgetHome.data.design.itemListBgImage;
                        $rootScope.backgroundImageItem = WidgetHome.data.design.itemDetailsBgImage;
                        console.log('$rootScope.backgroundImage', $rootScope.backgroundImage);
                        console.log('$rootScope.backgroundImageItem', $rootScope.backgroundImageItem);
                        console.log('--------------', WidgetHome.data.design.showImages);
                        if (WidgetHome.view && event.data.content && event.data.content.carouselImages) {
                            WidgetHome.view.loadItems(event.data.content.carouselImages);
                        }
                        if (!WidgetHome.data.design)
                            WidgetHome.data.design = {};
                        if (!WidgetHome.data.design.showImages)
                            WidgetHome.data.design.showImages = FEED_IMAGES.YES;
                        if (WidgetHome.data.content && WidgetHome.data.content.rssUrl) {
                            if (WidgetHome.data.content.rssUrl !== currentRssUrl) {
                                currentRssUrl = WidgetHome.data.content.rssUrl;
                                getFeedData(WidgetHome.data.content.rssUrl);
                            }
                        } else {
                            resetDefaults();
                        }
                    }
                };

                /**
                 * @name init()
                 * @private
                 * It is used to fetch previously saved user's data
                 */
                var init = function () {
                    viewedItems.init();
                    
                    var success = function (result) {
                        cache.getCache(function (err, data) {
                          // if the rss feed url has changed, ignore the cache and update when fetched 
                          if (err || !data || !WidgetHome.data.content || data.rssUrl != WidgetHome.data.content.rssUrl) return;
                          getFeedDataSuccess(data);
                        });

                        if (Object.keys(result.data).length > 0) {
                            WidgetHome.data = result.data;
                            $rootScope.data = result.data;
                        } else {
                            WidgetHome.data = _data;
                            $rootScope.data = _data;
                        }
                        if (WidgetHome.data.design) {
                            $rootScope.backgroundImage = WidgetHome.data.design.itemListBgImage;
                            $rootScope.backgroundImageItem = WidgetHome.data.design.itemDetailsBgImage;
                        }
                        if (WidgetHome.data.content && WidgetHome.data.content.rssUrl) {
                            currentRssUrl = WidgetHome.data.content.rssUrl;
                            buildfire.appearance.ready();
                            getFeedData(WidgetHome.data.content.rssUrl);
                        }
                        if (!WidgetHome.data.design) {
                            WidgetHome.data.design = {};
                        }
                        if (!WidgetHome.data.design.showImages) {
                            WidgetHome.data.design.showImages = FEED_IMAGES.YES;
                        }
                        viewedItems.sync(WidgetHome.items);
                    },
                    error = function (err) {
                        console.error('Error while getting data', err);
                    };
                    DataStore.get(TAG_NAMES.RSS_FEED_INFO).then(success, error);
                };

                /**
                 * @name init() function invocation to fetch previously saved user's data from datastore.
                 */
                init();

                /**
                 * @name DataStore.onUpdate() will invoked when there is some change in datastore
                 */
                DataStore.onUpdate().then(null, null, onUpdateCallback);

                /**
                 * @name WidgetHome.showDescription() method
                 * will be called to check whether the description have text to show or no.
                 * @param description
                 * @returns {boolean}
                 */
                WidgetHome.showDescription = function (description) {
                    var _retVal = false;
                    description = description.trim();
                    if (description && (description !== '<p>&nbsp;<br></p>') && (description !== '<p><br data-mce-bogus="1"></p>')) {
                        _retVal = true;
                    }
                    return _retVal;
                };

                /**
                 * @name WidgetHome.getTitle() method
                 * Will used to extract item title
                 * @param item
                 * @returns {item.title|*}
                 */
                WidgetHome.getTitle = function (item) {
                    if (item) {
                        var truncatedTitle = '';
                        if (!item.title && (item.summary || item.description)) {
                            var html = item.summary ? item.summary : item.description;
                            item.title = html;
                            truncatedTitle = $filter('truncate')(html, 50);
                        } else {
                            truncatedTitle = $filter('truncate')(item.title, 50);
                        }
                        return truncatedTitle;
                    }
                };

                /**
                 * @name WidgetHome.getFullTitle() method
                 * Will used to extract item title
                 * @param item
                 * @returns {item.title|*}
                 */
                WidgetHome.getFullTitle = function (item) {
                    if (item) {
                        if (!item.title && (item.summary || item.description)) {
                            var html = item.summary ? item.summary : item.description;
                            item.title=html;
                            return html;
                        } else {
                            return item.title;
                        }
                    }
                };

                /**
                 * @name WidgetHome.getItemSummary() method
                 * Will used to extract item summary
                 * @param item
                 * @returns {*}
                 */
                WidgetHome.getItemSummary = function (item) {
                    if (item && (item.summary || item.description)) {
                        var html = item.summary ? item.summary : item.description;
                        return $filter('truncate')(html, 100);
                    } else {
                        return '';
                    }
                };

                /**
                 * @name WidgetHome.getItemPublishDate() method
                 * Will used to extract item published date
                 * @param item
                 * @returns {*}
                 */
                WidgetHome.getItemPublishDate = function (item) {
                    if (item) {
                        var dateStr = item.pubDate ? item.pubDate : '';
                        if (dateStr) {
                            return $filter('date')(dateStr, 'MMM dd, yyyy');
                        } else {
                            return dateStr;
                        }
                    }
                };

                /**
                 * @name WidgetHome.goToItem() method
                 * will used to redirect on details page
                 * @param index
                 */
                WidgetHome.goToItem = function (index, item) {
                    $rootScope.preventResetDefaults = true;
                    if(WidgetHome.data.readRequiresLogin) {
                        buildfire.auth.getCurrentUser(function (err, user) {
                            if (err) return console.error(err);
                            if (user) {
                                WidgetHome.proceedToItem(index, item);
                            } else {
                                buildfire.auth.login({ allowCancel: true }, function(err, user) {
                                    if (err) return console.error(err);
                                    if (user) {
                                        $rootScope.showFeed = false;
                                        WidgetHome.proceedToItem(index, item);
                                    }
                                });
                            }
                        });
                    } else {
                        WidgetHome.proceedToItem(index, item);
                    }
                };
                WidgetHome.proceedToItem = function (index, item) {
                    setTimeout(function () {
                        viewedItems.markViewed($scope, item.guid);
                    }, 500);
                    if (WidgetHome.items[index]) {
                        WidgetHome.items[index].index = index;
                    }
                    // ItemDetailsService.setData(WidgetHome.items[index]);
                    ItemDetailsService.setData(item);
                    // Buildfire.history.push(WidgetHome.items[index].title, {});
                    Buildfire.history.push(item.title, {});
                    Location.goTo('#/item');
                };

                WidgetHome.bookmark = function ($event, item) {
                    $event.stopImmediatePropagation();
                    var isBookmarked = item.bookmarked ? true : false;
                    if (isBookmarked) {
                        bookmarks.delete($scope, item);
                    } else {
                        bookmarks.add($scope, item);
                    }
                };

                WidgetHome.share = function ($event, item) {
                    $event.stopImmediatePropagation();

                    ItemDetailsService.share(item);
                };

                var initAuthUpdate = function () {
                    Buildfire.auth.onLogin(function () {
                        init();
                    });

                    Buildfire.auth.onLogout(function () {
                        init();
                    });
                };

                /**
                 * @name WidgetHome.loadMore() function
                 * will used to load more items on scroll to implement lazy loading
                 */
                WidgetHome.loadMore = function () {
                    if (WidgetHome.busy || totalChunks === 0) {
                        return;
                    }
                    WidgetHome.busy = true;
                    if (!isInit) Buildfire.spinner.show();
                    if (nextChunkDataIndex < totalChunks) {
                        nextChunk = chunkData[nextChunkDataIndex];
                        WidgetHome.items.push.apply(WidgetHome.items, nextChunk);
                        nextChunkDataIndex = nextChunkDataIndex + 1;
                        nextChunk = null;
                        WidgetHome.busy = false;
                    }
                    bookmarks.sync($scope);
                    viewedItems.sync($scope.WidgetHome.items);
                };

                /**
                 * will called when controller scope has been destroyed.
                 */
                $scope.$on("$destroy", function () {
                    DataStore.clearListener();
                });

                $rootScope.$on("ROUTE_CHANGED", function (e, itemListLayout) {
                    initAuthUpdate();
                    if (!WidgetHome.data.design) {
                        WidgetHome.data.design = {};
                    }
                    WidgetHome.data.design.itemListLayout = itemListLayout;
                    DataStore.onUpdate().then(null, null, onUpdateCallback);
                });

                $rootScope.$on("Carousel:LOADED", function () {
                    WidgetHome.view = null;
                    if (!WidgetHome.view) {
                        WidgetHome.view = new Buildfire.components.carousel.view("#carousel", [], "WideScreen", null, true);
                    }
                    if (WidgetHome.data && WidgetHome.data.content.carouselImages) {
                        //                        WidgetHome.view = new Buildfire.components.carousel.view("#carousel", WidgetHome.data.content.carouselImages);
                        WidgetHome.view.loadItems(WidgetHome.data.content.carouselImages, null, 'WideScreen');
                    } else {
                        WidgetHome.view.loadItems([]);
                    }
                });

                initAuthUpdate();
                /**
                 * Implementation of pull down to refresh
                 */
                var onRefresh = Buildfire.datastore.onRefresh(function () {
                    Buildfire.history.pop();
                    Location.goToHome();
                });

            }
        ]);
})(window.angular);