/**
 * @license Copyright (c) 2003-2016, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

'use strict';

import LiveRange from './liverange.js';
import CharacterProxy from './characterproxy.js';
import toMap from '../../utils/tomap.js';

import Selection from './selection.js';

const storePrefix = 'selection:';

/**
 * Represents a main {@link engine.model.Selection selection} of a {@link engine.model.Document}. This is the selection
 * that user interacts with. `DocumentSelection` instance is created by {@link engine.model.Document}. You should not
 * create an instance of `DocumentSelection`.
 *
 * Differences between {@link engine.model.Selection} and `DocumentSelection` are two:
 * * ranges added to this selection updates automatically when the document changes,
 * * document selection may have attributes.
 *
 * @memberOf engine.model
 */
export default class DocumentSelection extends Selection {
	/**
	 * @inheritDoc
	 */
	constructor( document ) {
		super( document );

		/**
		 * List of attributes set on current selection.
		 *
		 * @protected
		 * @member {Map} engine.model.DocumentSelection#_attrs
		 */
		this._attrs = new Map();
	}

	/**
	 * Unbinds all events previously bound by document selection.
	 */
	destroy() {
		for ( let i = 0; i < this._ranges.length; i++ ) {
			this._ranges[ i ].detach();
		}
	}

	/**
	 * @inheritDoc
	 */
	removeAllRanges() {
		this.destroy();
		super.removeAllRanges();
	}

	/**
	 * @inheritDoc
	 */
	setRanges( newRanges, isLastBackward ) {
		this.destroy();
		super.setRanges( newRanges, isLastBackward );
	}

	/**
	 * Removes all attributes from the selection.
	 *
	 * @fires engine.model.DocumentSelection#change:attribute
	 */
	clearAttributes() {
		this._attrs.clear();
		this._setStoredAttributesTo( new Map() );

		this.fire( 'change:attribute' );
	}

	/**
	 * Gets an attribute value for given key or `undefined` if that attribute is not set on the selection.
	 *
	 * @param {String} key Key of attribute to look for.
	 * @returns {*} Attribute value or `undefined`.
	 */
	getAttribute( key ) {
		return this._attrs.get( key );
	}

	/**
	 * Returns iterator that iterates over this selection attributes.
	 *
	 * @returns {Iterable.<*>}
	 */
	getAttributes() {
		return this._attrs[ Symbol.iterator ]();
	}

	/**
	 * Checks if the selection has an attribute for given key.
	 *
	 * @param {String} key Key of attribute to check.
	 * @returns {Boolean} `true` if attribute with given key is set on selection, `false` otherwise.
	 */
	hasAttribute( key ) {
		return this._attrs.has( key );
	}

	/**
	 * Removes an attribute with given key from the selection.
	 *
	 * @fires engine.model.DocumentSelection#change:attribute
	 * @param {String} key Key of attribute to remove.
	 */
	removeAttribute( key ) {
		this._attrs.delete( key );
		this._removeStoredAttribute( key );

		this.fire( 'change:attribute' );
	}

	/**
	 * Sets attribute on the selection. If attribute with the same key already is set, it overwrites its values.
	 *
	 * @fires engine.model.DocumentSelection#change:attribute
	 * @param {String} key Key of attribute to set.
	 * @param {*} value Attribute value.
	 */
	setAttribute( key, value ) {
		this._attrs.set( key, value );
		this._storeAttribute( key, value );

		this.fire( 'change:attribute' );
	}

	/**
	 * Removes all attributes from the selection and sets given attributes.
	 *
	 * @fires engine.model.DocumentSelection#change:attribute
	 * @param {Iterable|Object} attrs Iterable object containing attributes to be set.
	 */
	setAttributesTo( attrs ) {
		this._attrs = toMap( attrs );
		this._setStoredAttributesTo( this._attrs );

		this.fire( 'change:attribute' );
	}

	/**
	 * @inheritDoc
	 */
	_popRange() {
		this._ranges.pop().detach();
	}

	/**
	 * @inheritDoc
	 */
	_pushRange( range ) {
		this._checkRange( range );
		this._ranges.push( LiveRange.createFromRange( range ) );
	}

	/**
	 * Iterates through all attributes stored in current selection's parent.
	 *
	 * @returns {Iterable.<*>}
	 */
	*_getStoredAttributes() {
		const selectionParent = this.getFirstPosition().parent;

		if ( this.isCollapsed && selectionParent.getChildCount() === 0 ) {
			for ( let attr of selectionParent.getAttributes() ) {
				if ( attr[ 0 ].indexOf( storePrefix ) === 0 ) {
					const realKey = attr[ 0 ].substr( storePrefix.length );

					yield [ realKey, attr[ 1 ] ];
				}
			}
		}
	}

	/**
	 * Removes attribute with given key from attributes stored in current selection's parent node.
	 *
	 * @private
	 * @param {String} key Key of attribute to remove.
	 */
	_removeStoredAttribute( key ) {
		const selectionParent = this.getFirstPosition().parent;

		if ( this.isCollapsed && selectionParent.getChildCount() === 0 ) {
			const storeKey = DocumentSelection._getStoreAttributeKey( key );

			this._document.enqueueChanges( () => {
				this._document.batch().removeAttr( storeKey, selectionParent );
			} );
		}
	}

	/**
	 * Stores given attribute key and value in current selection's parent node if the selection is collapsed and
	 * the parent node is empty.
	 *
	 * @private
	 * @param {String} key Key of attribute to set.
	 * @param {*} value Attribute value.
	 */
	_storeAttribute( key, value ) {
		const selectionParent = this.getFirstPosition().parent;

		if ( this.isCollapsed && selectionParent.getChildCount() === 0 ) {
			const storeKey = DocumentSelection._getStoreAttributeKey( key );

			this._document.enqueueChanges( () => {
				this._document.batch().setAttr( storeKey, value, selectionParent );
			} );
		}
	}

	/**
	 * Sets selection attributes stored in current selection's parent node to given set of attributes.
	 *
	 * @param {Iterable|Object} attrs Iterable object containing attributes to be set.
	 * @private
	 */
	_setStoredAttributesTo( attrs ) {
		const selectionParent = this.getFirstPosition().parent;

		if ( this.isCollapsed && selectionParent.getChildCount() === 0 ) {
			this._document.enqueueChanges( () => {
				const batch = this._document.batch();

				for ( let attr of this._getStoredAttributes() ) {
					const storeKey = DocumentSelection._getStoreAttributeKey( attr[ 0 ] );

					batch.removeAttr( storeKey, selectionParent );
				}

				for ( let attr of attrs ) {
					const storeKey = DocumentSelection._getStoreAttributeKey( attr[ 0 ] );

					batch.setAttr( storeKey, attr[ 1 ], selectionParent );
				}
			} );
		}
	}

	/**
	 * Updates this selection attributes according to it's ranges and the document.
	 *
	 * @fires engine.model.DocumentSelection#change:attribute
	 * @protected
	 */
	_updateAttributes() {
		const position = this.getFirstPosition();
		const positionParent = position.parent;

		let attrs = null;

		if ( !this.isCollapsed ) {
			// 1. If selection is a range...
			const range = this.getFirstRange();

			// ...look for a first character node in that range and take attributes from it.
			for ( let item of range ) {
				// This is not an optimal solution because of https://github.com/ckeditor/ckeditor5-engine/issues/454.
				// It can be done better by using `break;` instead of checking `attrs === null`.
				if ( item.type == 'TEXT' && attrs === null ) {
					attrs = item.item.getAttributes();
				}
			}
		} else {
			// 2. If the selection is a caret or the range does not contain a character node...

			const nodeBefore = positionParent.getChild( position.offset - 1 );
			const nodeAfter = positionParent.getChild( position.offset );

			// ...look at the node before caret and take attributes from it if it is a character node.
			attrs = getAttrsIfCharacter( nodeBefore );

			// 3. If not, look at the node after caret...
			if ( !attrs ) {
				attrs = getAttrsIfCharacter( nodeAfter );
			}

			// 4. If not, try to find the first character on the left, that is in the same node.
			if ( !attrs ) {
				let node = nodeBefore;

				while ( node && !attrs ) {
					node = node.previousSibling;
					attrs = getAttrsIfCharacter( node );
				}
			}

			// 5. If not found, try to find the first character on the right, that is in the same node.
			if ( !attrs ) {
				let node = nodeAfter;

				while ( node && !attrs ) {
					node = node.nextSibling;
					attrs = getAttrsIfCharacter( node );
				}
			}

			// 6. If not found, selection should retrieve attributes from parent.
			if ( !attrs ) {
				attrs = this._getStoredAttributes();
			}
		}

		if ( attrs ) {
			this._attrs = new Map( attrs );
		} else {
			this.clearAttributes();
		}

		function getAttrsIfCharacter( node ) {
			if ( node instanceof CharacterProxy ) {
				return node.getAttributes();
			}

			return null;
		}

		this.fire( 'change:attribute' );
	}

	/**
	 * Generates and returns an attribute key for selection attributes store, basing on original attribute key.
	 *
	 * @param {String} key Attribute key to convert.
	 * @returns {String} Converted attribute key, applicable for selection store.
	 */
	static _getStoreAttributeKey( key ) {
		return storePrefix + key;
	}
}

/**
 * Fired whenever selection attributes are changed.
 *
 * @event engine.model.DocumentSelection#change:attribute
 */
